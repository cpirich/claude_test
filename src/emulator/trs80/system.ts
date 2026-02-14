/**
 * TRS-80 Model I System Integration
 *
 * Wires together the Z80 CPU, memory bus, keyboard, and video subsystems
 * into a complete TRS-80 Model I emulator.
 *
 * Boot process:
 *   1. Z80 resets with PC=$0000
 *   2. Level II BASIC ROM initializes hardware, clears video RAM
 *   3. Displays "MEMORY SIZE?" prompt, then "READY" after Enter
 *   4. BASIC interpreter loop reads keyboard, executes commands
 *
 * Interrupt handling:
 *   The TRS-80 Model I generates a maskable interrupt (IRQ) on each
 *   video vertical retrace at ~40 Hz. Level II BASIC uses this for
 *   keyboard scanning, cassette timing, and the system clock.
 *   At 1.774 MHz, ~40 Hz = one interrupt every ~44,350 cycles.
 */

import { Z80 } from '@/cpu/z80';
import type { IOBus } from '@/cpu/z80/types';
import type { SoftwareEntry } from '@/emulator/apple1/software-library';
import { TRS80Memory } from './memory';
import { TRS80Keyboard, type TRS80Key } from './keyboard';
import { TRS80Video, type VideoChangeCallback } from './video';

/**
 * Cycles between timer interrupts (~40 Hz at 1.774 MHz).
 * Real hardware: 1,774,000 / 40 ≈ 44,350 cycles per interrupt.
 */
const CYCLES_PER_INTERRUPT = 44_350;

/**
 * TRS-80 Model I I/O bus.
 *
 * The Model I uses port $FF for several functions:
 *   Read:  bit 7 = timer interrupt pending (1 = pending)
 *          other bits: cassette input, etc.
 *   Write: bit 2 = cassette output
 *          bit 5 = cassette motor control
 *          other bits: various control signals
 *
 * Reading port $FF clears the timer interrupt flag.
 */
class TRS80IOBus implements IOBus {
  /** Timer interrupt pending flag. */
  timerInterruptPending = false;

  /** Last value written to port $FF. */
  private portFFWrite = 0;

  in(port: number): number {
    const portLow = port & 0xff;
    if (portLow === 0xff) {
      // Port $FF read: return interrupt status and clear it
      const status = this.timerInterruptPending ? 0x80 : 0x00;
      this.timerInterruptPending = false;
      return status;
    }
    // Other ports: return 0xFF (floating bus)
    return 0xff;
  }

  out(port: number, value: number): void {
    const portLow = port & 0xff;
    if (portLow === 0xff) {
      this.portFFWrite = value;
    }
    // Other ports: ignored
  }

  reset(): void {
    this.timerInterruptPending = false;
    this.portFFWrite = 0;
  }
}

export class TRS80System {
  readonly cpu: Z80;
  readonly memory: TRS80Memory;
  readonly keyboard: TRS80Keyboard;
  readonly video: TRS80Video;
  private readonly io: TRS80IOBus;

  /** Cycles since last timer interrupt. */
  private cyclesSinceInterrupt = 0;

  constructor() {
    this.keyboard = new TRS80Keyboard();
    this.video = new TRS80Video();
    this.memory = new TRS80Memory(this.keyboard, this.video);
    this.io = new TRS80IOBus();
    this.cpu = new Z80(this.memory, this.io);
  }

  /** Load a ROM image into the ROM area ($0000-$2FFF). */
  loadROM(data: Uint8Array): void {
    this.memory.loadROM(data);
  }

  /** Reset the entire system. */
  reset(): void {
    this.keyboard.reset();
    this.video.reset();
    this.io.reset();
    this.cyclesSinceInterrupt = 0;
    this.cpu.reset();
  }

  /** Execute a single Z80 instruction. Returns cycles consumed. */
  step(): number {
    const cycles = this.cpu.step();
    this.cyclesSinceInterrupt += cycles;
    this.keyboard.tick(cycles);
    this.checkTimerInterrupt();
    return cycles;
  }

  /**
   * Run the CPU for a specified number of cycles. Returns actual cycles.
   * Generates timer interrupts at ~40 Hz intervals and advances the
   * keyboard buffer state machine.
   *
   * When the CPU is halted (HALT instruction), it idles until an interrupt
   * wakes it up. The loop fast-forwards to the next interrupt boundary
   * so EI + HALT sequences don't stall the emulator.
   */
  run(cycles: number): number {
    let total = 0;
    while (total < cycles) {
      if (this.cpu.halted) {
        // CPU is halted — fast-forward to the next interrupt boundary.
        // On real hardware the CPU NOPs until an interrupt arrives.
        const toInterrupt = CYCLES_PER_INTERRUPT - this.cyclesSinceInterrupt;
        const delta = Math.min(toInterrupt, cycles - total);
        total += delta;
        this.cyclesSinceInterrupt += delta;
        this.keyboard.tick(delta);
        this.checkTimerInterrupt();
        // If still halted (interrupts disabled or not yet delivered), stop
        if (this.cpu.halted) break;
      } else {
        const stepCycles = this.cpu.step();
        total += stepCycles;
        this.cyclesSinceInterrupt += stepCycles;
        this.keyboard.tick(stepCycles);
        this.checkTimerInterrupt();
      }
    }
    return total;
  }

  /**
   * Check if it's time to fire a timer interrupt.
   *
   * The TRS-80's INT line is level-triggered: it stays asserted until
   * the CPU acknowledges by reading port $FF.  We model this by
   * attempting irq() whenever timerInterruptPending is true, not just
   * at the moment the timer fires.  This ensures that an interrupt
   * pending while the CPU has interrupts disabled (DI) gets delivered
   * as soon as the CPU re-enables them (EI).
   */
  private checkTimerInterrupt(): void {
    if (this.cyclesSinceInterrupt >= CYCLES_PER_INTERRUPT) {
      this.cyclesSinceInterrupt -= CYCLES_PER_INTERRUPT;
      this.io.timerInterruptPending = true;
    }
    if (this.io.timerInterruptPending) {
      this.cpu.irq();
    }
  }

  /** Press a key on the keyboard. */
  keyDown(key: TRS80Key): void {
    this.keyboard.keyDown(key);
  }

  /** Release a key on the keyboard. */
  keyUp(key: TRS80Key): void {
    this.keyboard.keyUp(key);
  }

  /** Register a callback for video RAM changes. */
  setVideoChangeCallback(cb: VideoChangeCallback): void {
    this.video.setOnChange(cb);
  }

  /** Get the current program counter. */
  getPC(): number {
    return this.cpu.getPC();
  }

  /** Get total elapsed cycles. */
  getCycles(): number {
    return this.cpu.cycles;
  }

  /** Check if the CPU is halted. */
  isHalted(): boolean {
    return this.cpu.halted;
  }

  /**
   * Load a software entry into memory.
   * - Loads all regions (can be ROM $0000-$2FFF or RAM $4000+)
   * - If any region loads into ROM space, performs a reset
   * - Sets PC to entry point if provided (for RAM-based software)
   */
  loadSoftware(entry: SoftwareEntry): void {
    if (entry.regions.length === 0) return;

    // Check if this entry loads into ROM space ($0000-$2FFF)
    const loadsIntoROM = entry.regions.some(
      (r) => r.startAddress < 0x3000
    );

    this.memory.loadSoftwareEntry(entry);

    // If loading a ROM, reset the system to boot the new ROM
    if (loadsIntoROM) {
      this.reset();
    } else {
      // For RAM-based software, set PC to entry point if specified
      if (entry.entryPoint !== undefined && entry.entryPoint !== 0) {
        this.cpu.pc = entry.entryPoint;
      }
    }
  }
}

/**
 * Altair 8800 System Integration
 *
 * Wires together the Intel 8080 CPU, memory bus, 2SIO serial board,
 * and front panel into a complete Altair 8800 emulator.
 *
 * The Altair 8800 is unique among the emulated machines: it has no ROM
 * by default. Programs are entered via the front panel toggle switches
 * (EXAMINE/DEPOSIT) or loaded from the software catalog.
 *
 * Clock speed: 2 MHz → ~33,333 cycles/frame at 60 FPS.
 */

import { I8080 } from '@/cpu/i8080';
import type { SoftwareEntry } from '@/emulator/apple1/software-library';
import { AltairMemory } from './memory';
import { Altair2SIO, type SerialOutputCallback } from './serial';
import { AltairFrontPanel } from './front-panel';

export class Altair8800System {
  readonly cpu: I8080;
  readonly memory: AltairMemory;
  readonly serial: Altair2SIO;
  readonly panel: AltairFrontPanel;

  constructor() {
    this.memory = new AltairMemory();
    this.serial = new Altair2SIO();
    this.cpu = new I8080(this.memory, this.serial);
    this.panel = new AltairFrontPanel();
    this.panel.connect(this.cpu, this.memory);
  }

  /** Reset the entire system. */
  reset(): void {
    this.serial.reset();
    this.cpu.reset();
    this.panel.reset();
  }

  /**
   * Run the CPU for a specified number of cycles. Returns actual cycles.
   * Only runs if the front panel is in "running" mode.
   */
  run(cycles: number): number {
    if (!this.panel.running) return 0;

    const total = this.cpu.run(cycles);

    // If the CPU halted, stop the panel too
    if (this.cpu.halted) {
      this.panel.running = false;
    }

    this.panel.updateLEDs();
    return total;
  }

  /**
   * Load a software entry into memory.
   * - Loads all regions into RAM
   * - Sets PC to entry point
   * - Does NOT auto-start — user must click RUN on the front panel
   */
  loadSoftware(entry: SoftwareEntry): void {
    if (entry.regions.length === 0) return;

    this.memory.loadSoftwareEntry(entry);

    if (entry.entryPoint !== undefined) {
      this.cpu.pc = entry.entryPoint;
    }

    this.panel.updateLEDs();
  }

  /** Register a callback for serial output characters. */
  setSerialOutputCallback(cb: SerialOutputCallback): void {
    this.serial.setOutputCallback(cb);
  }

  /** Send a character to the serial input (keyboard). */
  serialInput(char: number): void {
    this.serial.sendInput(char);
  }

  /** Send a string to the serial input. */
  serialInputString(str: string): void {
    this.serial.sendString(str);
  }

  /** Get the current program counter. */
  getPC(): number {
    return this.cpu.pc;
  }

  /** Get total elapsed cycles. */
  getCycles(): number {
    return this.cpu.cycles;
  }

  /** Check if the CPU is halted. */
  isHalted(): boolean {
    return this.cpu.halted;
  }

  /** Check if the system is running. */
  isRunning(): boolean {
    return this.panel.running;
  }
}

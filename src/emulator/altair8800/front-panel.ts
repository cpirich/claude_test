/**
 * Altair 8800 Front Panel State Model
 *
 * Manages the toggle switches, LEDs, and panel operations that define
 * the Altair 8800's primary user interface.
 *
 * Switch state:
 *   - addressSwitches (16-bit): A15-A0 toggle switches
 *   - dataSwitches (8-bit): D7-D0 sense switches
 *
 * LED state (updated from CPU state):
 *   - addressLEDs (16-bit): current address bus value
 *   - dataLEDs (8-bit): current data bus value
 *   - statusLEDs: machine status indicators
 *
 * Operations (momentary control switches):
 *   EXAMINE, EXAMINE NEXT, DEPOSIT, DEPOSIT NEXT,
 *   RUN, STOP, SINGLE STEP, RESET
 */

import type { I8080 } from '@/cpu/i8080';
import type { AltairMemory } from './memory';

/** Status LED bit flags. */
export const STATUS_INTE  = 0x01; // Interrupts enabled
export const STATUS_MEMR  = 0x02; // Memory read
export const STATUS_INP   = 0x04; // Input
export const STATUS_M1    = 0x08; // Machine cycle 1 (instruction fetch)
export const STATUS_OUT   = 0x10; // Output
export const STATUS_HLTA  = 0x20; // Halt acknowledge
export const STATUS_STACK = 0x40; // Stack access
export const STATUS_WO    = 0x80; // Write out (active low on real hardware, but we use active high)

/** Snapshot of front panel state for UI rendering. */
export interface FrontPanelState {
  addressSwitches: number;
  dataSwitches: number;
  addressLEDs: number;
  dataLEDs: number;
  statusLEDs: number;
  running: boolean;
}

export class AltairFrontPanel {
  /** 16-bit address toggle switches (A15-A0). */
  addressSwitches = 0;

  /** 8-bit data/sense toggle switches (D7-D0). */
  dataSwitches = 0;

  /** 16-bit address bus LEDs. */
  addressLEDs = 0;

  /** 8-bit data bus LEDs. */
  dataLEDs = 0;

  /** Status LEDs bitmask. */
  statusLEDs = 0;

  /** Whether the CPU is running (continuous execution). */
  running = false;

  /** References set by the system orchestrator. */
  private cpu: I8080 | null = null;
  private memory: AltairMemory | null = null;

  /** Connect the panel to the CPU and memory (called by system). */
  connect(cpu: I8080, memory: AltairMemory): void {
    this.cpu = cpu;
    this.memory = memory;
  }

  /**
   * EXAMINE: Load address switches into PC, read memory at that address,
   * display on address and data LEDs.
   */
  examine(): void {
    if (!this.cpu || !this.memory) return;
    this.cpu.pc = this.addressSwitches;
    this.addressLEDs = this.cpu.pc;
    this.dataLEDs = this.memory.read(this.cpu.pc);
    this.statusLEDs = STATUS_MEMR | STATUS_M1 | STATUS_WO;
  }

  /**
   * EXAMINE NEXT: Increment PC, read memory at new address,
   * display on address and data LEDs.
   */
  examineNext(): void {
    if (!this.cpu || !this.memory) return;
    this.cpu.pc = (this.cpu.pc + 1) & 0xffff;
    this.addressLEDs = this.cpu.pc;
    this.dataLEDs = this.memory.read(this.cpu.pc);
    this.statusLEDs = STATUS_MEMR | STATUS_M1 | STATUS_WO;
  }

  /**
   * DEPOSIT: Write data switches into memory at current PC address.
   */
  deposit(): void {
    if (!this.cpu || !this.memory) return;
    this.memory.write(this.cpu.pc, this.dataSwitches);
    this.addressLEDs = this.cpu.pc;
    this.dataLEDs = this.dataSwitches;
    this.statusLEDs = STATUS_MEMR;
  }

  /**
   * DEPOSIT NEXT: Increment PC, then write data switches into memory.
   */
  depositNext(): void {
    if (!this.cpu || !this.memory) return;
    this.cpu.pc = (this.cpu.pc + 1) & 0xffff;
    this.memory.write(this.cpu.pc, this.dataSwitches);
    this.addressLEDs = this.cpu.pc;
    this.dataLEDs = this.dataSwitches;
    this.statusLEDs = STATUS_MEMR;
  }

  /** RUN: Start continuous CPU execution. */
  run(): void {
    if (!this.cpu) return;
    this.cpu.halted = false;
    this.running = true;
    this.statusLEDs = STATUS_MEMR | STATUS_M1 | STATUS_WO;
  }

  /** STOP: Halt CPU execution. */
  stop(): void {
    this.running = false;
    this.updateLEDs();
  }

  /** SINGLE STEP: Execute one instruction and update LEDs. */
  singleStep(): void {
    if (!this.cpu) return;
    this.running = false;
    this.cpu.halted = false;
    this.cpu.step();
    this.updateLEDs();
  }

  /** RESET: Reset the CPU (PC=0) and stop execution. */
  reset(): void {
    if (!this.cpu) return;
    this.running = false;
    this.cpu.reset();
    this.updateLEDs();
  }

  /**
   * Update LED state from current CPU state.
   * Called after each frame when running, or after panel operations.
   */
  updateLEDs(): void {
    if (!this.cpu || !this.memory) return;
    this.addressLEDs = this.cpu.pc;
    this.dataLEDs = this.memory.read(this.cpu.pc);

    let status = STATUS_WO;
    if (this.cpu.interruptsEnabled) status |= STATUS_INTE;
    if (this.cpu.halted) status |= STATUS_HLTA;
    if (!this.running) status |= STATUS_MEMR | STATUS_M1;
    this.statusLEDs = status;
  }

  /** Get the current front panel state snapshot for UI rendering. */
  getState(): FrontPanelState {
    return {
      addressSwitches: this.addressSwitches,
      dataSwitches: this.dataSwitches,
      addressLEDs: this.addressLEDs,
      dataLEDs: this.dataLEDs,
      statusLEDs: this.statusLEDs,
      running: this.running,
    };
  }

  /** Set a specific address switch (0-15). */
  setAddressSwitch(bit: number, value: boolean): void {
    if (bit < 0 || bit > 15) return;
    if (value) {
      this.addressSwitches |= (1 << bit);
    } else {
      this.addressSwitches &= ~(1 << bit);
    }
  }

  /** Toggle a specific address switch (0-15). */
  toggleAddressSwitch(bit: number): void {
    if (bit < 0 || bit > 15) return;
    this.addressSwitches ^= (1 << bit);
  }

  /** Set a specific data switch (0-7). */
  setDataSwitch(bit: number, value: boolean): void {
    if (bit < 0 || bit > 7) return;
    if (value) {
      this.dataSwitches |= (1 << bit);
    } else {
      this.dataSwitches &= ~(1 << bit);
    }
  }

  /** Toggle a specific data switch (0-7). */
  toggleDataSwitch(bit: number): void {
    if (bit < 0 || bit > 7) return;
    this.dataSwitches ^= (1 << bit);
  }
}

/**
 * Apple I System — Wires together CPU, PIA, Terminal, Memory, and ROM
 *
 * This is the top-level emulator object. It creates all subsystems,
 * connects them, and provides the interface for the UI layer:
 *   - reset() to cold-start the machine
 *   - keyPress(ascii) to feed keyboard input
 *   - run(cycles) to execute CPU instructions
 *   - getTerminalLines() to read the display state
 */

import { Cpu6502 } from '@/cpu/cpu';
import { PIA } from './pia';
import { Terminal, COLS, ROWS } from './terminal';
import { WozMonitorROM } from './woz-monitor-rom';
import { Apple1Memory } from './memory';
import type { SoftwareEntry } from './software-library';

/** Cycles per video frame at 1.023 MHz / 60 fps. */
const CYCLES_PER_FRAME = Math.round(1_023_000 / 60);

export class Apple1 {
  readonly cpu: Cpu6502;
  readonly pia: PIA;
  readonly terminal: Terminal;
  readonly rom: WozMonitorROM;
  readonly memory: Apple1Memory;

  constructor() {
    this.pia = new PIA();
    this.terminal = new Terminal();
    this.rom = new WozMonitorROM();
    this.memory = new Apple1Memory(this.pia, this.rom);
    this.cpu = new Cpu6502(this.memory);

    // Wire PIA display output → Terminal
    this.pia.setDisplayOutputCallback((char) => this.terminal.putChar(char));
  }

  /** Cold reset: clear RAM, reset PIA, reset terminal, reset CPU (reads reset vector). */
  reset(): void {
    this.memory.resetRAM();
    this.pia.reset();
    this.terminal.reset();
    this.memory.setRomEnabled(true);
    this.cpu.reset();
  }

  /**
   * Feed a keypress into the emulator.
   * Accepts a 7-bit ASCII value (0x00-0x7F). The PIA sets bit 7 internally.
   */
  keyPress(ascii: number): void {
    this.pia.keyPress(ascii & 0x7f);
  }

  /** Run the CPU for one frame's worth of cycles. */
  runFrame(): void {
    this.cpu.run(CYCLES_PER_FRAME);
  }

  /** Run the CPU for a specific number of cycles. */
  run(cycles: number): void {
    this.cpu.run(cycles);
  }

  /** Get the terminal display as an array of padded row strings. */
  getTerminalLines(): string[] {
    return this.terminal.getLines();
  }

  /** Get terminal cursor position. */
  getCursor(): { col: number; row: number } {
    return {
      col: this.terminal.getCursorCol(),
      row: this.terminal.getCursorRow(),
    };
  }

  /**
   * Load a software entry into memory.
   * - Diagnostic ROMs at $FF00: disable Woz Monitor, clear state, load, reset CPU
   * - RAM programs: load into RAM, set PC to entry point
   * - Entries with no regions (e.g. "Woz Monitor"): no-op
   * - Always clears the terminal screen when loading new software
   */
  loadSoftware(entry: SoftwareEntry): void {
    if (entry.regions.length === 0) return;

    const replacesRom = entry.regions.some(
      (r) => r.startAddress >= 0xff00 && r.startAddress <= 0xffff
    );

    if (replacesRom) {
      this.terminal.reset();
      this.memory.resetRAM();
      this.memory.setRomEnabled(false);
      this.memory.loadSoftwareEntry(entry);
      this.cpu.reset(); // Reads reset vector from loaded code
    } else {
      this.terminal.reset();
      this.memory.loadSoftwareEntry(entry);
      this.cpu.pc = entry.entryPoint;
    }
  }

  /** Terminal dimensions. */
  get cols(): number {
    return COLS;
  }

  get rows(): number {
    return ROWS;
  }
}

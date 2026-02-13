/**
 * Apple-1 Memory Bus
 *
 * Routes CPU memory accesses to the appropriate subsystem:
 *   $0000-$0FFF  RAM (4KB)
 *   $D010-$D013  PIA (keyboard/display I/O)
 *   $FF00-$FFFF  ROM (Woz Monitor or diagnostic ROM)
 *
 * Implements the Memory interface required by the Cpu6502 class.
 */

import type { Memory } from '@/cpu/types';
import type { SoftwareEntry } from './software-library';
import { PIA } from './pia';

/** ROM interface — anything with a read(address) method. */
export interface ROM {
  read(address: number): number;
}

export class Apple1Memory implements Memory {
  private ram: Uint8Array;
  private pia: PIA;
  private rom: ROM;
  private romEnabled: boolean = true;

  constructor(pia: PIA, rom: ROM) {
    this.ram = new Uint8Array(65536);
    this.pia = pia;
    this.rom = rom;
  }

  read(address: number): number {
    address &= 0xffff;

    if (PIA.inRange(address)) {
      return this.pia.read(address);
    }

    if (this.romEnabled && address >= 0xff00) {
      return this.rom.read(address);
    }

    return this.ram[address];
  }

  write(address: number, value: number): void {
    address &= 0xffff;
    value &= 0xff;

    if (PIA.inRange(address)) {
      this.pia.write(address, value);
      return;
    }

    // ROM is read-only when enabled
    if (this.romEnabled && address >= 0xff00) {
      return;
    }

    this.ram[address] = value;
  }

  /** Load a block of bytes into RAM at the given address. */
  loadBytes(startAddress: number, data: Uint8Array): void {
    this.ram.set(data, startAddress & 0xffff);
  }

  /** Load all memory regions from a software catalog entry. */
  loadSoftwareEntry(entry: SoftwareEntry): void {
    for (const region of entry.regions) {
      this.loadBytes(region.startAddress, region.data);
    }
  }

  /**
   * Enable or disable ROM interception at $FF00-$FFFF.
   * When disabled, reads return RAM contents, allowing diagnostic
   * ROMs loaded at $FF00 to be executed.
   */
  setRomEnabled(enabled: boolean): void {
    this.romEnabled = enabled;
  }

  /** Returns whether the ROM is currently active. */
  isRomEnabled(): boolean {
    return this.romEnabled;
  }

  /** Reset RAM to zeros. Does not affect ROM or PIA state. */
  resetRAM(): void {
    this.ram.fill(0);
  }

  /** Direct RAM access for test inspection. */
  peekRAM(address: number): number {
    return this.ram[address & 0xffff];
  }

  /** Direct RAM write for test setup. */
  pokeRAM(address: number, value: number): void {
    this.ram[address & 0xffff] = value & 0xff;
  }
}

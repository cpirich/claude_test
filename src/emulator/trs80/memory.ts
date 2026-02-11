/**
 * TRS-80 Model I Memory Bus
 *
 * Routes Z80 memory accesses to the appropriate subsystem:
 *   $0000-$2FFF  Level II BASIC ROM (12K, read-only)
 *   $3000-$37FF  Additional ROM / unused (returns $FF)
 *   $3800-$3BFF  Keyboard matrix (read-only, memory-mapped)
 *   $3C00-$3FFF  Video RAM (1K, read/write)
 *   $4000-$FFFF  User RAM (up to 48K)
 *
 * Implements the Memory interface required by the Z80 class.
 */

import type { Memory } from '@/cpu/z80/types';
import { TRS80Keyboard } from './keyboard';
import { TRS80Video } from './video';

export class TRS80Memory implements Memory {
  private rom: Uint8Array;
  private ram: Uint8Array;
  private keyboard: TRS80Keyboard;
  private video: TRS80Video;

  constructor(keyboard: TRS80Keyboard, video: TRS80Video) {
    this.rom = new Uint8Array(0x3000); // 12K ROM
    this.ram = new Uint8Array(0xc000); // 48K user RAM ($4000-$FFFF)
    this.keyboard = keyboard;
    this.video = video;
  }

  /**
   * Load a ROM image into the ROM area ($0000-$2FFF).
   * Accepts up to 12K of data.
   */
  loadROM(data: Uint8Array): void {
    // Clear entire ROM area first to avoid stale data when loading a
    // smaller ROM (e.g. 4K Level I BASIC after 12K stub ROM).
    this.rom.fill(0);
    const len = Math.min(data.length, this.rom.length);
    this.rom.set(data.subarray(0, len));
  }

  read(address: number): number {
    address &= 0xffff;

    // $0000-$2FFF: ROM
    if (address < 0x3000) {
      return this.rom[address];
    }

    // $3000-$37FF: Unused ROM area (returns $FF)
    if (address < 0x3800) {
      return 0xff;
    }

    // $3800-$3BFF: Keyboard matrix
    if (TRS80Keyboard.inRange(address)) {
      return this.keyboard.read(address);
    }

    // $3C00-$3FFF: Video RAM
    if (TRS80Video.inRange(address)) {
      return this.video.read(address);
    }

    // $4000-$FFFF: User RAM
    return this.ram[address - 0x4000];
  }

  write(address: number, value: number): void {
    address &= 0xffff;
    value &= 0xff;

    // $0000-$37FF: ROM and keyboard are read-only
    if (address < 0x3800) {
      return;
    }

    // $3800-$3BFF: Keyboard is read-only
    if (TRS80Keyboard.inRange(address)) {
      return;
    }

    // $3C00-$3FFF: Video RAM
    if (TRS80Video.inRange(address)) {
      this.video.write(address, value);
      return;
    }

    // $4000-$FFFF: User RAM
    this.ram[address - 0x4000] = value;
  }

  /** Direct RAM read for test inspection. */
  peekRAM(address: number): number {
    if (address >= 0x4000 && address <= 0xffff) {
      return this.ram[address - 0x4000];
    }
    return 0;
  }

  /** Direct RAM write for test setup. */
  pokeRAM(address: number, value: number): void {
    if (address >= 0x4000 && address <= 0xffff) {
      this.ram[address - 0x4000] = value & 0xff;
    }
  }

  /** Direct ROM read for test inspection. */
  peekROM(address: number): number {
    if (address < 0x3000) {
      return this.rom[address];
    }
    return 0;
  }
}

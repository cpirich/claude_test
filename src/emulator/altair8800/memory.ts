/**
 * Altair 8800 Memory Bus
 *
 * Simple flat 64K RAM — all addresses read/write.
 * No ROM by default; programs are entered via front panel DEPOSIT
 * or loaded from the software catalog.
 *
 * Implements the Memory interface required by the I8080 class.
 */

import type { Memory } from '@/cpu/i8080';
import type { SoftwareEntry } from '@/emulator/apple1/software-library';

export class AltairMemory implements Memory {
  private ram: Uint8Array;

  constructor() {
    this.ram = new Uint8Array(0x10000); // 64K
  }

  read(address: number): number {
    return this.ram[address & 0xffff];
  }

  write(address: number, value: number): void {
    this.ram[address & 0xffff] = value & 0xff;
  }

  /** Load a block of bytes at the given address. */
  loadBytes(startAddress: number, data: Uint8Array): void {
    for (let i = 0; i < data.length; i++) {
      this.ram[(startAddress + i) & 0xffff] = data[i];
    }
  }

  /** Load all memory regions from a software catalog entry. */
  loadSoftwareEntry(entry: SoftwareEntry): void {
    for (const region of entry.regions) {
      this.loadBytes(region.startAddress, region.data);
    }
  }

  /** Clear all RAM to zero. */
  clear(): void {
    this.ram.fill(0);
  }

  /** Direct RAM read for test inspection. */
  peek(address: number): number {
    return this.ram[address & 0xffff];
  }

  /** Direct RAM write for test setup. */
  poke(address: number, value: number): void {
    this.ram[address & 0xffff] = value & 0xff;
  }
}

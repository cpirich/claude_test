/**
 * Z80 CPU Types
 *
 * The Zilog Z80 has a richer register set than the 6502:
 * - Main registers: A, F, B, C, D, E, H, L
 * - Shadow registers: A', F', B', C', D', E', H', L'
 * - Index registers: IX, IY (16-bit)
 * - Special: SP, PC, I (interrupt vector), R (memory refresh)
 * - Interrupt flip-flops: IFF1, IFF2
 * - Interrupt mode: IM 0, 1, or 2
 */

/** Memory interface — same as used by the 6502. */
export interface Memory {
  read(address: number): number;
  write(address: number, value: number): void;
}

/** I/O port interface — Z80 uses IN/OUT instructions for port I/O. */
export interface IOBus {
  in(port: number): number;
  out(port: number, value: number): void;
}

/** Snapshot of all Z80 registers. */
export interface Z80State {
  // Main registers
  a: number;
  f: number;
  b: number;
  c: number;
  d: number;
  e: number;
  h: number;
  l: number;

  // Shadow registers
  a_: number;
  f_: number;
  b_: number;
  c_: number;
  d_: number;
  e_: number;
  h_: number;
  l_: number;

  // Index registers
  ix: number;
  iy: number;

  // Special registers
  sp: number;
  pc: number;
  i: number;   // Interrupt vector base
  r: number;   // Memory refresh counter

  // Interrupt state
  iff1: boolean;
  iff2: boolean;
  im: 0 | 1 | 2;

  // Execution state
  cycles: number;
  halted: boolean;
}

// Z80 flag bit positions (in F register)
export const FLAG_C  = 0x01; // Carry
export const FLAG_N  = 0x02; // Subtract (BCD)
export const FLAG_PV = 0x04; // Parity/Overflow
export const FLAG_F3 = 0x08; // Undocumented bit 3
export const FLAG_H  = 0x10; // Half-carry (BCD)
export const FLAG_F5 = 0x20; // Undocumented bit 5
export const FLAG_Z  = 0x40; // Zero
export const FLAG_S  = 0x80; // Sign

/** No-op I/O bus for testing — returns 0xFF on all reads. */
export class NullIOBus implements IOBus {
  in(_port: number): number {
    return 0xff;
  }
  out(_port: number, _value: number): void {
    // no-op
  }
}

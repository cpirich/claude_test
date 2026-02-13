/**
 * Intel 8080 CPU Types
 *
 * The 8080 has:
 * - Registers: A (accumulator), B, C, D, E, H, L
 * - Register pairs: BC, DE, HL, SP (for 16-bit operations)
 * - Flags: S, Z, AC (aux carry), P (parity), CY (carry)
 * - Special: SP (stack pointer), PC (program counter)
 * - No shadow registers, no index registers (those are Z80 additions)
 */

/** Memory interface — same as used by the 6502 and Z80. */
export { type Memory } from '@/cpu/types';

/** I/O port interface — 8080 uses IN/OUT instructions for port I/O. */
export { type IOBus, NullIOBus } from '@/cpu/z80/types';

// 8080 flag bit positions (in F register)
// Layout: S Z 0 AC 0 P 1 CY  (bits 7→0)
// Bit 1 is always 1, bits 3 and 5 are always 0
export const FLAG_CY = 0x01; // Carry (bit 0)
export const FLAG_P  = 0x04; // Parity (bit 2)
export const FLAG_AC = 0x10; // Auxiliary carry / half-carry (bit 4)
export const FLAG_Z  = 0x40; // Zero (bit 6)
export const FLAG_S  = 0x80; // Sign (bit 7)

// Bits that are always set/cleared in the flags register
export const FLAG_ALWAYS_ONE = 0x02;  // Bit 1 always 1
export const FLAG_MASK = FLAG_S | FLAG_Z | FLAG_AC | FLAG_P | FLAG_CY | FLAG_ALWAYS_ONE;

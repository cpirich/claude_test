/**
 * Z80 Precomputed Lookup Tables
 *
 * Parity, Sign+Zero tables for fast flag computation.
 */

import { FLAG_S, FLAG_Z } from './types';

/** Parity table: bit 2 (FLAG_PV) set if byte has even number of 1-bits. */
export const PARITY_TABLE: Uint8Array = (() => {
  const table = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    let bits = i;
    let parity = 0;
    while (bits) {
      parity ^= bits & 1;
      bits >>= 1;
    }
    // FLAG_PV = 0x04; set if even parity (parity === 0)
    table[i] = parity === 0 ? 0x04 : 0;
  }
  return table;
})();

/** Build Sign+Zero table: FLAG_S if bit 7 set, FLAG_Z if value is 0. */
export function buildSZTable(): Uint8Array {
  const table = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    table[i] = (i === 0 ? FLAG_Z : 0) | (i & FLAG_S);
  }
  return table;
}

/**
 * Bruce Clark's 6502 Decimal Mode Test
 *
 * Exhaustive verification of ADC and SBC behavior in decimal (BCD) mode.
 * Tests all 65536 combinations of two 8-bit operands for both addition
 * and subtraction, with both carry flag states (carry set and clear).
 *
 * This test checks:
 * - Accumulator result (chk_a)
 * - Carry flag result (chk_c)
 *
 * N, V, and Z flags are NOT checked by default because the NMOS 6502
 * has undefined behavior for these flags in decimal mode.
 *
 * Configuration (matching the assembled binary):
 *   cputype = 0   (NMOS 6502)
 *   vld_bcd = 0   (test invalid BCD values too)
 *   chk_a   = 1   (check accumulator)
 *   chk_n   = 0   (skip N flag)
 *   chk_v   = 0   (skip V flag)
 *   chk_z   = 0   (skip Z flag)
 *   chk_c   = 1   (check carry flag)
 *
 * Source: http://www.6502.org/tutorials/decimal_mode.html
 * Assembled from Klaus Dormann's repo: 6502_decimal_test.a65
 *
 * The test binary loads at $0200. Entry point is $0200.
 * Success: JMP-to-self trap at $024B with ERROR ($0B) = 0
 * Failure: JMP-to-self trap at $024B with ERROR ($0B) = 1
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  setupDecimalTest,
  runUntilTrap,
  TEST_ADDRESSES,
} from './cpu-test-harness';

const FIXTURE_PATH = join(__dirname, 'fixtures', '6502_decimal_test.bin');

function loadTestBinary(): Uint8Array {
  return new Uint8Array(readFileSync(FIXTURE_PATH));
}

describe('Bruce Clark 6502 Decimal Mode Test', () => {
  it('should load the test binary', () => {
    const data = loadTestBinary();
    expect(data.length).toBeGreaterThan(0);
    // First instruction at $0200 should be LDY #1 ($A0 $01)
    expect(data[0]).toBe(0xA0);
    expect(data[1]).toBe(0x01);
  });

  it('should have the DONE trap at $024B', () => {
    const data = loadTestBinary();
    // $024B relative to load address $0200 = offset $4B
    // JMP $024B (4C 4B 02)
    const offset = TEST_ADDRESSES.DECIMAL_DONE - TEST_ADDRESSES.DECIMAL_ENTRY;
    expect(data[offset]).toBe(0x4C);
    expect(data[offset + 1]).toBe(0x4B);
    expect(data[offset + 2]).toBe(0x02);
  });

  it('should pass all decimal mode tests (ADC + SBC, all operand combinations)', () => {
    const data = loadTestBinary();
    const { cpu, memory } = setupDecimalTest(data);

    const result = runUntilTrap(
      cpu,
      TEST_ADDRESSES.DECIMAL_DONE,
      // Decimal test takes ~60M cycles at 1 MHz; allow generous headroom
      200_000_000,
      100_000_000,
    );

    // Log result for visibility
    console.log(result.message);

    expect(result.termination).not.toBe('cycle_limit');
    expect(result.termination).not.toBe('instruction_limit');

    // The trap should be at the DONE address
    expect(result.trapAddress).toBe(TEST_ADDRESSES.DECIMAL_DONE);

    // Check the ERROR variable: 0 = pass, 1 = fail
    const error = memory.peek(TEST_ADDRESSES.DECIMAL_ERROR_ADDR);
    if (error !== 0) {
      // Provide diagnostic info
      const n1 = memory.peek(0x00);
      const n2 = memory.peek(0x01);
      const da = memory.peek(0x04);
      const ar = memory.peek(0x06);
      console.error(
        `Decimal test FAILED: ERROR=${error}, ` +
        `N1=$${n1.toString(16).padStart(2, '0')}, ` +
        `N2=$${n2.toString(16).padStart(2, '0')}, ` +
        `DA (actual)=$${da.toString(16).padStart(2, '0')}, ` +
        `AR (predicted)=$${ar.toString(16).padStart(2, '0')}`
      );
    }

    expect(error).toBe(0);
  }, 120_000); // 2-minute timeout for this exhaustive test
});

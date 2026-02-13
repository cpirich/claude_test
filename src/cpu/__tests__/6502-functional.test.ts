/**
 * Klaus Dormann's 6502 Functional Test Suite
 *
 * Gold standard for 6502 CPU verification. Tests all documented
 * instructions and addressing modes including:
 *
 * - Load/store operations (LDA, LDX, LDY, STA, STX, STY)
 * - Arithmetic (ADC, SBC) in both binary and decimal modes
 * - Logic operations (AND, ORA, EOR)
 * - Shift/rotate (ASL, LSR, ROL, ROR)
 * - Increment/decrement (INC, DEC, INX, INY, DEX, DEY)
 * - Compare (CMP, CPX, CPY)
 * - Branch instructions (BCC, BCS, BEQ, BNE, BMI, BPL, BVC, BVS)
 * - Jump/call (JMP, JSR, RTS, RTI)
 * - Stack operations (PHA, PLA, PHP, PLP)
 * - Flag operations (CLC, SEC, CLD, SED, CLI, SEI, CLV)
 * - Transfer (TAX, TAY, TXA, TYA, TSX, TXS)
 * - BIT, NOP, BRK
 *
 * Source: https://github.com/Klaus2m5/6502_65C02_functional_tests
 *
 * The test binary is a full 64KB image. Execution starts at $0400.
 * Success is indicated by a JMP-to-self trap at $382F.
 * Failure is indicated by a JMP-to-self trap at any other address.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  setupFunctionalTest,
  runUntilTrap,
  TEST_ADDRESSES,
} from './cpu-test-harness';

const FIXTURE_PATH = join(__dirname, 'fixtures', '6502_functional_test.bin');

function loadTestBinary(): Uint8Array {
  return new Uint8Array(readFileSync(FIXTURE_PATH));
}

describe('Klaus Dormann 6502 Functional Test Suite', () => {
  it('should load the test binary (65536 bytes)', () => {
    const data = loadTestBinary();
    expect(data.length).toBe(65536);
    // First instruction at $0400 should be CLD ($D8)
    expect(data[0x0400]).toBe(0xD8);
  });

  it('should have the success trap at $3469', () => {
    const data = loadTestBinary();
    // $3469: JMP $3469 (4C 69 34)
    expect(data[0x3469]).toBe(0x4C);
    expect(data[0x346A]).toBe(0x69);
    expect(data[0x346B]).toBe(0x34);
  });

  it('should pass all functional tests', () => {
    const data = loadTestBinary();
    const { cpu } = setupFunctionalTest(data);

    const result = runUntilTrap(
      cpu,
      TEST_ADDRESSES.FUNCTIONAL_SUCCESS,
      // The test takes ~96M cycles at 1 MHz; allow generous headroom
      200_000_000,
      100_000_000,
    );

    // Log result for visibility in test output
    console.log(result.message);

    expect(result.termination).not.toBe('cycle_limit');
    expect(result.termination).not.toBe('instruction_limit');

    if (!result.passed) {
      // Provide diagnostic info about which test section failed
      const failAddr = result.trapAddress;
      console.error(
        `FAILED at $${failAddr.toString(16).padStart(4, '0')}. ` +
        `Check the listing file (6502_functional_test.lst) for the ` +
        `test that traps at this address.`
      );
    }

    expect(result.passed).toBe(true);
    expect(result.trapAddress).toBe(TEST_ADDRESSES.FUNCTIONAL_SUCCESS);
  }, 120_000); // 2-minute timeout for this comprehensive test
});

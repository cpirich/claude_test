/**
 * ZEXDOC — Z80 Documented Instruction Exerciser
 *
 * Gold standard for Z80 CPU verification. Tests all documented Z80
 * instructions by running them with many input combinations and
 * comparing CRC-32 checksums against values from real Z80 hardware.
 *
 * ZEXDOC tests only documented flag behavior (masks out undocumented
 * flag bits 3 and 5). ZEXALL tests all flags including undocumented.
 *
 * The test runs as a CP/M .COM program that uses BDOS calls for
 * console output. Our harness provides a minimal CP/M environment.
 *
 * Source: https://github.com/agn453/ZEXALL
 * Original by Frank D. Cringle, J.G. Harston
 *
 * Test groups include:
 * - 16-bit arithmetic (adc/sbc hl, add hl/ix/iy)
 * - 8-bit ALU operations (all operand variants)
 * - Bit manipulation (bit, set, res)
 * - Block transfers (cpd, cpi, ldd, ldi)
 * - DAA, CPL, SCF, CCF
 * - Inc/dec (all registers and register pairs)
 * - Load operations (8-bit and 16-bit)
 * - Rotates and shifts
 * - Jump, call, return instructions
 * - I/O instructions (in/out)
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  setupCPMEnvironment,
  runZexTest,
} from './zex-harness';

const ZEXDOC_PATH = join(__dirname, 'fixtures', 'zexdoc.com');
const ZEXALL_PATH = join(__dirname, 'fixtures', 'zexall.com');

function loadBinary(path: string): Uint8Array {
  return new Uint8Array(readFileSync(path));
}

describe('ZEXDOC — Z80 Documented Instruction Exerciser', () => {
  it('should load the ZEXDOC binary', () => {
    const data = loadBinary(ZEXDOC_PATH);
    expect(data.length).toBe(8704);
    // First instruction should be JP $0113
    expect(data[0]).toBe(0xC3); // JP
    expect(data[1]).toBe(0x13); // low byte
    expect(data[2]).toBe(0x01); // high byte
  });

  it('should set up CP/M environment correctly', () => {
    const data = loadBinary(ZEXDOC_PATH);
    const { cpu, memory } = setupCPMEnvironment(data);

    // PC at entry point
    expect(cpu.pc).toBe(0x0100);
    // BDOS entry has RET
    expect(memory.peek(0x0005)).toBe(0xC9);
    // Warm boot has HALT
    expect(memory.peek(0x0000)).toBe(0x76);
    // Stack has $0000 return address
    expect(memory.peek(cpu.sp)).toBe(0x00);
    expect(memory.peek(cpu.sp + 1)).toBe(0x00);
  });

  it('should pass all documented instruction tests', () => {
    const data = loadBinary(ZEXDOC_PATH);
    const { cpu, memory } = setupCPMEnvironment(data);

    // Collect output lines for progress reporting
    let currentLine = '';
    const result = runZexTest(cpu, memory, 50_000_000_000, 20_000_000_000, (ch) => {
      if (ch === '\n' || ch === '\r') {
        if (currentLine.trim()) {
          console.log(currentLine);
        }
        currentLine = '';
      } else {
        currentLine += ch;
      }
    });
    // Flush last line
    if (currentLine.trim()) {
      console.log(currentLine);
    }

    console.log(`\nCompleted: ${result.passCount} passed, ${result.failCount} failed`);
    console.log(`Total: ${result.instructions.toLocaleString()} instructions, ${result.cycles.toLocaleString()} cycles`);

    expect(result.termination).toBe('complete');

    // Report individual failures
    for (const group of result.groups) {
      if (!group.passed) {
        console.error(
          `FAILED: ${group.name} — ` +
          `expected CRC: ${group.expectedCRC}, got: ${group.actualCRC}`
        );
      }
    }

    expect(result.failCount).toBe(0);
    expect(result.passCount).toBeGreaterThan(0);
    expect(result.allPassed).toBe(true);
  }, 600_000); // 10-minute timeout — ZEXDOC is exhaustive
});

describe('ZEXALL — Z80 Full Instruction Exerciser', () => {
  it('should load the ZEXALL binary', () => {
    const data = loadBinary(ZEXALL_PATH);
    expect(data.length).toBe(8704);
    expect(data[0]).toBe(0xC3); // JP
  });

  it('should pass all instruction tests (including undocumented flags)', () => {
    const data = loadBinary(ZEXALL_PATH);
    const { cpu, memory } = setupCPMEnvironment(data);

    let currentLine = '';
    const result = runZexTest(cpu, memory, 50_000_000_000, 20_000_000_000, (ch) => {
      if (ch === '\n' || ch === '\r') {
        if (currentLine.trim()) {
          console.log(currentLine);
        }
        currentLine = '';
      } else {
        currentLine += ch;
      }
    });
    if (currentLine.trim()) {
      console.log(currentLine);
    }

    console.log(`\nCompleted: ${result.passCount} passed, ${result.failCount} failed`);
    console.log(`Total: ${result.instructions.toLocaleString()} instructions, ${result.cycles.toLocaleString()} cycles`);

    expect(result.termination).toBe('complete');

    for (const group of result.groups) {
      if (!group.passed) {
        console.error(
          `FAILED: ${group.name} — ` +
          `expected CRC: ${group.expectedCRC}, got: ${group.actualCRC}`
        );
      }
    }

    expect(result.failCount).toBe(0);
    expect(result.passCount).toBeGreaterThan(0);
    expect(result.allPassed).toBe(true);
  }, 600_000); // 10-minute timeout
});

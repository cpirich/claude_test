/**
 * 8080EX1 — Intel 8080 Instruction Exerciser
 *
 * Gold standard for 8080 CPU verification. Tests all documented 8080
 * instructions by running them with many input combinations and
 * comparing CRC-32 checksums against values from real 8080 hardware.
 *
 * The test runs as a CP/M .COM program that uses BDOS calls for
 * console output. Our harness provides a minimal CP/M environment.
 *
 * Source: https://github.com/begoon/8080ex1
 *
 * To run this test, download 8080EX1.COM and place it in
 * src/cpu/i8080/__tests__/fixtures/8080EX1.COM
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { setupCPMEnvironment, runExTest } from './8080-test-harness';

const EX1_PATH = join(__dirname, 'fixtures', '8080EX1.COM');

function loadBinary(path: string): Uint8Array {
  return new Uint8Array(readFileSync(path));
}

describe('8080EX1 — Intel 8080 Instruction Exerciser', () => {
  it('should set up CP/M environment correctly', () => {
    // Test with a minimal program: just a RET
    const data = new Uint8Array([0xC9]); // RET
    const { cpu, memory } = setupCPMEnvironment(data);

    // PC at entry point
    expect(cpu.pc).toBe(0x0100);
    // BDOS entry has RET
    expect(memory.peek(0x0005)).toBe(0xC9);
    // Warm boot has HLT
    expect(memory.peek(0x0000)).toBe(0x76);
    // Stack has $0000 return address
    expect(memory.peek(cpu.sp)).toBe(0x00);
    expect(memory.peek(cpu.sp + 1)).toBe(0x00);
  });

  it('should handle BDOS function 2 (character output)', () => {
    // Program: MVI C,2; MVI E,'A'; CALL 5; RET
    const data = new Uint8Array([
      0x0E, 0x02,       // MVI C, 2
      0x1E, 0x41,       // MVI E, 'A'
      0xCD, 0x05, 0x00, // CALL 0005
      0xC9,             // RET
    ]);
    const { cpu, memory } = setupCPMEnvironment(data);
    const result = runExTest(cpu, memory, 1_000_000, 1_000_000);
    expect(result.output).toContain('A');
    expect(result.termination).toBe('complete');
  });

  it('should handle BDOS function 9 (string output)', () => {
    // Program: MVI C,9; LXI D,msg; CALL 5; RET; msg: db 'Hello$'
    const data = new Uint8Array([
      0x0E, 0x09,             // MVI C, 9
      0x11, 0x08 + 0x00, 0x01, // LXI D, 0x0108 (address of msg at offset 8 + 0x100)
      0xCD, 0x05, 0x00,       // CALL 0005
      0xC9,                   // RET
      // msg at offset 8:
      0x48, 0x65, 0x6C, 0x6C, 0x6F, 0x24, // "Hello$"
    ]);
    const { cpu, memory } = setupCPMEnvironment(data);
    const result = runExTest(cpu, memory, 1_000_000, 1_000_000);
    expect(result.output).toContain('Hello');
    expect(result.termination).toBe('complete');
  });

  // The full exerciser test - skipped until binary is provided
  const hasExBinary = existsSync(EX1_PATH);

  (hasExBinary ? it : it.skip)('should pass all instruction tests', () => {
    const data = loadBinary(EX1_PATH);
    const { cpu, memory } = setupCPMEnvironment(data);

    let currentLine = '';
    const result = runExTest(cpu, memory, 50_000_000_000, 20_000_000_000, (ch) => {
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
  }, 600_000);
});

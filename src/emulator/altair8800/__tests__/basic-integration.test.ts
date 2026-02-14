/**
 * BASIC Program Integration Tests (Altair 8800 / Intel 8080)
 *
 * These tests simulate BASIC program patterns using hand-assembled 8080
 * machine code. They exercise the same CPU, stack, and serial I/O paths
 * that real BASIC interpreters use, without requiring remote ROM fetches.
 *
 * Key differences from the TRS-80 integration tests:
 *   - Output via serial OUT to port 0x11 (not video RAM writes)
 *   - 8080 instruction set only (no Z80-only: JR, DJNZ, IX/IY)
 *   - Capture output via serial output callback
 *
 * Each test builds a ROM image with:
 *   - A CHAR_OUT subroutine at $0100 (polls 2SIO, outputs character)
 *   - A PRINT_NUM subroutine at $0120 (converts byte to decimal ASCII)
 *   - A NEWLINE subroutine at $0180 (outputs CR/LF)
 *   - Main program at $0000
 *   - String data at $0200+
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Altair8800System } from '../system';

/** Helper: create a ROM with common 8080 subroutines pre-installed. */
function createBasicROM(): { rom: Uint8Array; emit: (offset: number, ...bytes: number[]) => number } {
  const rom = new Uint8Array(0x1000); // 4KB — plenty for test programs

  // ============================================================
  // CHAR_OUT at $0100: Output character in A via 2SIO serial port.
  //   Polls status register (port 0x10) bit 1 (TX ready) before sending.
  //
  //   PUSH PSW          ; save character
  // poll:
  //   IN 0x10           ; read 2SIO status
  //   ANI 0x02          ; TX buffer empty?
  //   JZ poll           ; wait if not ready
  //   POP PSW           ; restore character
  //   OUT 0x11          ; send character
  //   RET
  // ============================================================
  let p = 0x100;
  rom[p++] = 0xf5;                                     // PUSH PSW
  // poll:
  const poll = p;
  rom[p++] = 0xdb; rom[p++] = 0x10;                   // IN 0x10
  rom[p++] = 0xe6; rom[p++] = 0x02;                   // ANI 0x02
  rom[p++] = 0xca; rom[p++] = poll & 0xff; rom[p++] = (poll >> 8) & 0xff; // JZ poll
  rom[p++] = 0xf1;                                     // POP PSW
  rom[p++] = 0xd3; rom[p++] = 0x11;                   // OUT 0x11
  rom[p++] = 0xc9;                                     // RET

  // ============================================================
  // PRINT_NUM at $0120: Print unsigned 8-bit number in A as decimal.
  //   Converts to up to 3 ASCII digits, suppresses leading zeros.
  //   Uses B as digit counter, C as remainder. Destroys A,B,C.
  //
  // All jumps use JP (absolute) — no Z80-only JR instructions.
  // ============================================================
  p = 0x120;
  rom[p++] = 0x4f;                                     // MOV C,A (save number)
  rom[p++] = 0x06; rom[p++] = 0x2f;                   // MVI B,'0'-1
  // hundreds:
  const hundreds = p;
  rom[p++] = 0x04;                                     // INR B
  rom[p++] = 0xd6; rom[p++] = 0x64;                   // SUI 100
  rom[p++] = 0xd2; rom[p++] = hundreds & 0xff; rom[p++] = (hundreds >> 8) & 0xff; // JNC hundreds
  rom[p++] = 0xc6; rom[p++] = 0x64;                   // ADI 100 (restore)
  rom[p++] = 0x4f;                                     // MOV C,A (save remainder)
  rom[p++] = 0x78;                                     // MOV A,B (hundreds digit)
  rom[p++] = 0xfe; rom[p++] = 0x30;                   // CPI '0'
  // JZ skip_hundreds (patch target below)
  const jz_skip_hundreds = p;
  rom[p++] = 0xca; rom[p++] = 0x00; rom[p++] = 0x00; // JZ (patched)
  // Print hundreds digit
  rom[p++] = 0xc5;                                     // PUSH B
  rom[p++] = 0xcd; rom[p++] = 0x00; rom[p++] = 0x01; // CALL CHAR_OUT
  rom[p++] = 0xc1;                                     // POP B
  rom[p++] = 0x3e; rom[p++] = 0x01;                   // MVI A,1 (flag: hundreds printed)
  // JMP do_tens (patch target below)
  const jmp_do_tens = p;
  rom[p++] = 0xc3; rom[p++] = 0x00; rom[p++] = 0x00; // JMP (patched)
  // skip_hundreds:
  const skip_hundreds = p;
  rom[jz_skip_hundreds + 1] = skip_hundreds & 0xff;
  rom[jz_skip_hundreds + 2] = (skip_hundreds >> 8) & 0xff;
  rom[p++] = 0x3e; rom[p++] = 0x00;                   // MVI A,0 (flag: no hundreds)
  // do_tens:
  const do_tens = p;
  rom[jmp_do_tens + 1] = do_tens & 0xff;
  rom[jmp_do_tens + 2] = (do_tens >> 8) & 0xff;
  rom[p++] = 0xf5;                                     // PUSH PSW (save flag)
  rom[p++] = 0x79;                                     // MOV A,C (remainder)
  rom[p++] = 0x06; rom[p++] = 0x2f;                   // MVI B,'0'-1
  // tens:
  const tens = p;
  rom[p++] = 0x04;                                     // INR B
  rom[p++] = 0xd6; rom[p++] = 0x0a;                   // SUI 10
  rom[p++] = 0xd2; rom[p++] = tens & 0xff; rom[p++] = (tens >> 8) & 0xff; // JNC tens
  rom[p++] = 0xc6; rom[p++] = 0x0a;                   // ADI 10 (restore)
  rom[p++] = 0x4f;                                     // MOV C,A (save ones)
  rom[p++] = 0xf1;                                     // POP PSW (check flag)
  rom[p++] = 0xb7;                                     // ORA A
  // JNZ print_tens (patch)
  const jnz_print_tens = p;
  rom[p++] = 0xc2; rom[p++] = 0x00; rom[p++] = 0x00; // JNZ (patched)
  rom[p++] = 0x78;                                     // MOV A,B (tens digit)
  rom[p++] = 0xfe; rom[p++] = 0x30;                   // CPI '0'
  // JZ skip_tens (patch)
  const jz_skip_tens = p;
  rom[p++] = 0xca; rom[p++] = 0x00; rom[p++] = 0x00; // JZ (patched)
  // print_tens:
  const print_tens = p;
  rom[jnz_print_tens + 1] = print_tens & 0xff;
  rom[jnz_print_tens + 2] = (print_tens >> 8) & 0xff;
  rom[p++] = 0x78;                                     // MOV A,B
  rom[p++] = 0xc5;                                     // PUSH B
  rom[p++] = 0xcd; rom[p++] = 0x00; rom[p++] = 0x01; // CALL CHAR_OUT
  rom[p++] = 0xc1;                                     // POP B
  // skip_tens:
  const skip_tens = p;
  rom[jz_skip_tens + 1] = skip_tens & 0xff;
  rom[jz_skip_tens + 2] = (skip_tens >> 8) & 0xff;
  rom[p++] = 0x79;                                     // MOV A,C (ones)
  rom[p++] = 0xc6; rom[p++] = 0x30;                   // ADI '0'
  rom[p++] = 0xcd; rom[p++] = 0x00; rom[p++] = 0x01; // CALL CHAR_OUT
  rom[p++] = 0xc9;                                     // RET

  // ============================================================
  // NEWLINE at $0180: Output CR (0x0D) + LF (0x0A) via serial.
  // ============================================================
  p = 0x180;
  rom[p++] = 0x3e; rom[p++] = 0x0d;                   // MVI A,0x0D (CR)
  rom[p++] = 0xcd; rom[p++] = 0x00; rom[p++] = 0x01; // CALL CHAR_OUT
  rom[p++] = 0x3e; rom[p++] = 0x0a;                   // MVI A,0x0A (LF)
  rom[p++] = 0xcd; rom[p++] = 0x00; rom[p++] = 0x01; // CALL CHAR_OUT
  rom[p++] = 0xc9;                                     // RET

  function emit(offset: number, ...bytes: number[]): number {
    for (const b of bytes) {
      rom[offset++] = b;
    }
    return offset;
  }

  return { rom, emit };
}

/** Helper: put a null-terminated ASCII string into the ROM at a given offset. */
function putString(rom: Uint8Array, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    rom[offset + i] = str.charCodeAt(i);
  }
  rom[offset + str.length] = 0;
}

/**
 * Helper: emit an inline print-string loop at the given ROM offset.
 * Expects HL to point to a null-terminated string in memory.
 * Uses 8080-only instructions (JP absolute instead of JR relative).
 * Returns the offset after the emitted code.
 */
function emitPrintString(rom: Uint8Array, p: number): number {
  // loop:
  const loop = p;
  rom[p++] = 0x7e;                                     // MOV A,M (load from HL)
  rom[p++] = 0xb7;                                     // ORA A (test for null)
  // JZ done (patch target below)
  const jz_done = p;
  rom[p++] = 0xca; rom[p++] = 0x00; rom[p++] = 0x00; // JZ (patched)
  rom[p++] = 0xe5;                                     // PUSH H
  rom[p++] = 0xcd; rom[p++] = 0x00; rom[p++] = 0x01; // CALL CHAR_OUT
  rom[p++] = 0xe1;                                     // POP H
  rom[p++] = 0x23;                                     // INX H
  rom[p++] = 0xc3; rom[p++] = loop & 0xff; rom[p++] = (loop >> 8) & 0xff; // JMP loop
  // done:
  const done = p;
  rom[jz_done + 1] = done & 0xff;
  rom[jz_done + 2] = (done >> 8) & 0xff;
  return p;
}

describe('Altair 8800 BASIC program integration tests', () => {
  let system: Altair8800System;
  let output: string;

  /** Load ROM and set up serial capture. */
  function loadAndRun(rom: Uint8Array, cycles: number): void {
    system.memory.loadBytes(0x0000, rom);
    system.setSerialOutputCallback((char: number) => {
      output += String.fromCharCode(char);
    });
    system.panel.run();
    system.run(cycles);
  }

  beforeEach(() => {
    system = new Altair8800System();
    output = '';
  });

  describe('PRINT string output', () => {
    it('should output "HELLO WORLD" via serial', () => {
      const { rom, emit } = createBasicROM();

      // String at $0200
      putString(rom, 0x200, 'HELLO WORLD');

      // Main program: init stack, print string, halt
      let p = 0;
      p = emit(p, 0x31, 0xff, 0xff);       // LXI SP,$FFFF
      p = emit(p, 0x21, 0x00, 0x02);       // LXI H,$0200 (string ptr)
      p = emitPrintString(rom, p);
      emit(p, 0x76);                       // HLT

      loadAndRun(rom, 100_000);

      expect(system.isHalted()).toBe(true);
      expect(output).toBe('HELLO WORLD');
    });

    it('should output multiple lines with CR/LF', () => {
      const { rom, emit } = createBasicROM();

      putString(rom, 0x200, 'LINE 1');
      putString(rom, 0x210, 'LINE 2');
      putString(rom, 0x220, 'LINE 3');

      let p = 0;
      p = emit(p, 0x31, 0xff, 0xff);       // LXI SP,$FFFF

      // Print "LINE 1"
      p = emit(p, 0x21, 0x00, 0x02);       // LXI H,$0200
      p = emitPrintString(rom, p);
      p = emit(p, 0xcd, 0x80, 0x01);       // CALL NEWLINE

      // Print "LINE 2"
      p = emit(p, 0x21, 0x10, 0x02);       // LXI H,$0210
      p = emitPrintString(rom, p);
      p = emit(p, 0xcd, 0x80, 0x01);       // CALL NEWLINE

      // Print "LINE 3"
      p = emit(p, 0x21, 0x20, 0x02);       // LXI H,$0220
      p = emitPrintString(rom, p);

      emit(p, 0x76);                       // HLT

      loadAndRun(rom, 200_000);

      expect(system.isHalted()).toBe(true);
      expect(output).toBe('LINE 1\r\nLINE 2\r\nLINE 3');
    });
  });

  describe('arithmetic and PRINT number', () => {
    it('should compute and display 2+2=4', () => {
      const { rom, emit } = createBasicROM();

      let p = 0;
      p = emit(p, 0x31, 0xff, 0xff);       // LXI SP,$FFFF
      p = emit(p, 0x3e, 0x02);             // MVI A,2
      p = emit(p, 0xc6, 0x02);             // ADI 2
      p = emit(p, 0xcd, 0x20, 0x01);       // CALL PRINT_NUM
      emit(p, 0x76);                       // HLT

      loadAndRun(rom, 50_000);

      expect(system.isHalted()).toBe(true);
      expect(output).toBe('4');
    });

    it('should compute and display 7*8=56', () => {
      const { rom, emit } = createBasicROM();

      // 7 * 8 via repeated addition (8080-only: DCR B / JNZ instead of DJNZ)
      let p = 0;
      p = emit(p, 0x31, 0xff, 0xff);       // LXI SP,$FFFF
      p = emit(p, 0x3e, 0x00);             // MVI A,0
      p = emit(p, 0x06, 0x08);             // MVI B,8
      const mul_loop = p;
      p = emit(p, 0xc6, 0x07);             // ADI 7
      p = emit(p, 0x05);                   // DCR B
      p = emit(p, 0xc2,                    // JNZ mul_loop
        mul_loop & 0xff, (mul_loop >> 8) & 0xff);
      p = emit(p, 0xcd, 0x20, 0x01);       // CALL PRINT_NUM
      emit(p, 0x76);                       // HLT

      loadAndRun(rom, 50_000);

      expect(system.isHalted()).toBe(true);
      expect(output).toBe('56');
    });

    it('should display 100 (three-digit number)', () => {
      const { rom, emit } = createBasicROM();

      let p = 0;
      p = emit(p, 0x31, 0xff, 0xff);       // LXI SP,$FFFF
      p = emit(p, 0x3e, 0x64);             // MVI A,100
      p = emit(p, 0xcd, 0x20, 0x01);       // CALL PRINT_NUM
      emit(p, 0x76);                       // HLT

      loadAndRun(rom, 50_000);

      expect(system.isHalted()).toBe(true);
      expect(output).toBe('100');
    });
  });

  describe('FOR loop simulation', () => {
    it('should print numbers 1 through 5 (FOR I=1 TO 5)', () => {
      const { rom, emit } = createBasicROM();

      // Uses register C as loop counter
      // 8080-only: use CMP B / JC / JZ instead of Z80 JR
      let p = 0;
      p = emit(p, 0x31, 0xff, 0xff);       // LXI SP,$FFFF
      p = emit(p, 0x0e, 0x01);             // MVI C,1 (I=1)
      p = emit(p, 0x06, 0x05);             // MVI B,5 (limit)
      // for_loop:
      const for_loop = p;
      p = emit(p, 0x79);                   // MOV A,C (A=I)
      p = emit(p, 0xc5);                   // PUSH B
      p = emit(p, 0xcd, 0x20, 0x01);       // CALL PRINT_NUM
      // Print space separator
      p = emit(p, 0x3e, 0x20);             // MVI A,' '
      p = emit(p, 0xcd, 0x00, 0x01);       // CALL CHAR_OUT
      p = emit(p, 0xc1);                   // POP B
      p = emit(p, 0x0c);                   // INR C (NEXT I)
      p = emit(p, 0x79);                   // MOV A,C
      p = emit(p, 0xb8);                   // CMP B
      p = emit(p, 0xda,                    // JC for_loop (C < B)
        for_loop & 0xff, (for_loop >> 8) & 0xff);
      p = emit(p, 0xca,                    // JZ for_loop (C == B, need <=)
        for_loop & 0xff, (for_loop >> 8) & 0xff);
      emit(p, 0x76);                       // HLT

      loadAndRun(rom, 200_000);

      expect(system.isHalted()).toBe(true);
      expect(output).toBe('1 2 3 4 5 ');
    });
  });

  describe('sense switch initialization', () => {
    it('should return 0x00 from sense switches (port 0xFF)', () => {
      const { rom, emit } = createBasicROM();

      // Read sense switches and verify the value selects 2SIO serial config.
      // With sense switches = 0x00, BASIC configures for 2SIO (ports 0x10/0x11).
      //
      // This test reads port 0xFF, stores the result, then outputs 'Y' if 0x00
      // or 'N' otherwise — verifying the fix for the BASIC "MEMORY SIZE?" bug.
      let p = 0;
      p = emit(p, 0x31, 0xff, 0xff);       // LXI SP,$FFFF
      p = emit(p, 0xdb, 0xff);             // IN 0xFF (sense switches)
      p = emit(p, 0xb7);                   // ORA A (test for zero)
      // JNZ not_zero
      const jnz_not_zero = p;
      p = emit(p, 0xc2, 0x00, 0x00);       // JNZ (patched)
      // Zero path: output 'Y' (correct default)
      p = emit(p, 0x3e, 0x59);             // MVI A,'Y'
      p = emit(p, 0xcd, 0x00, 0x01);       // CALL CHAR_OUT
      // JMP done
      const jmp_done = p;
      p = emit(p, 0xc3, 0x00, 0x00);       // JMP (patched)
      // not_zero: output 'N' (wrong default)
      const not_zero = p;
      rom[jnz_not_zero + 1] = not_zero & 0xff;
      rom[jnz_not_zero + 2] = (not_zero >> 8) & 0xff;
      p = emit(p, 0x3e, 0x4e);             // MVI A,'N'
      p = emit(p, 0xcd, 0x00, 0x01);       // CALL CHAR_OUT
      // done:
      const done = p;
      rom[jmp_done + 1] = done & 0xff;
      rom[jmp_done + 2] = (done >> 8) & 0xff;
      emit(p, 0x76);                       // HLT

      loadAndRun(rom, 50_000);

      expect(system.isHalted()).toBe(true);
      expect(output).toBe('Y');
    });

    it('should configure 2SIO serial I/O with sense switches = 0x00', () => {
      const { rom, emit } = createBasicROM();

      // Simulates the BASIC ROM's serial init path:
      // 1. Read sense switches (port 0xFF) → 0x00
      // 2. Configure 2SIO control register (port 0x10)
      // 3. Output a test character via 2SIO data port (port 0x11)
      let p = 0;
      p = emit(p, 0x31, 0xff, 0xff);       // LXI SP,$FFFF
      // Read sense switches
      p = emit(p, 0xdb, 0xff);             // IN 0xFF
      // With 0x00, BASIC selects 2SIO → write master reset to control register
      p = emit(p, 0x3e, 0x03);             // MVI A,0x03 (master reset)
      p = emit(p, 0xd3, 0x10);             // OUT 0x10 (2SIO control)
      p = emit(p, 0x3e, 0x11);             // MVI A,0x11 (8N2 + /16 clock)
      p = emit(p, 0xd3, 0x10);             // OUT 0x10 (2SIO control)
      // Output test character
      p = emit(p, 0x3e, 0x4f);             // MVI A,'O'
      p = emit(p, 0xcd, 0x00, 0x01);       // CALL CHAR_OUT
      p = emit(p, 0x3e, 0x4b);             // MVI A,'K'
      p = emit(p, 0xcd, 0x00, 0x01);       // CALL CHAR_OUT
      emit(p, 0x76);                       // HLT

      loadAndRun(rom, 50_000);

      expect(system.isHalted()).toBe(true);
      expect(output).toBe('OK');
    });
  });
});

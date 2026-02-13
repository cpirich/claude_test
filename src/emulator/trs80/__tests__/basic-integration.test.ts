/**
 * BASIC Program Integration Tests
 *
 * These tests simulate BASIC program patterns using hand-assembled Z80
 * machine code. They exercise the same CPU, stack, and video paths that
 * real BASIC interpreters use, without requiring remote ROM fetches.
 *
 * Each test builds a ROM image with:
 *   - A CHAR_OUT subroutine at $0100 (writes char, advances cursor)
 *   - A PRINT_NUM subroutine at $0120 (converts number to ASCII, prints)
 *   - A NEWLINE subroutine at $0150 (moves cursor to next row)
 *   - Main program at $0000
 *   - String data at $0200+
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TRS80System } from '../system';
import { VIDEO_COLS } from '../video';

/** Helper: create a ROM with common subroutines pre-installed. */
function createBasicROM(): { rom: Uint8Array; emit: (offset: number, ...bytes: number[]) => number } {
  const rom = new Uint8Array(0x3000);

  // ============================================================
  // Interrupt handler at $0038: return immediately (RETI).
  // The TRS-80 generates IRQs at ~40 Hz. Without this, the CPU
  // would jump to uninitialized memory and crash.
  // ============================================================
  rom[0x38] = 0xed; // RETI prefix
  rom[0x39] = 0x4d; // RETI

  // ============================================================
  // CHAR_OUT at $0100: Write char in A to video RAM at cursor, advance cursor.
  //   LD HL,($4000)   ; load cursor address
  //   LD (HL),A       ; write character
  //   INC HL          ; advance cursor
  //   LD ($4000),HL   ; save cursor address
  //   RET
  // ============================================================
  let p = 0x100;
  rom[p++] = 0x2a; rom[p++] = 0x00; rom[p++] = 0x40; // LD HL,($4000)
  rom[p++] = 0x77;                                     // LD (HL),A
  rom[p++] = 0x23;                                     // INC HL
  rom[p++] = 0x22; rom[p++] = 0x00; rom[p++] = 0x40; // LD ($4000),HL
  rom[p++] = 0xc9;                                     // RET

  // ============================================================
  // PRINT_NUM at $0120: Print unsigned 8-bit number in A as ASCII digits.
  //   Converts A to decimal and calls CHAR_OUT for each digit.
  //   Uses B as temp, destroys A,B,C.
  //
  //   ; Handle hundreds digit
  //   LD B,'0'-1       ; B = '0' - 1
  // hundreds:
  //   INC B
  //   SUB 100
  //   JR NC,hundreds
  //   ADD A,100         ; restore
  //   ; Only print hundreds if > 0
  //   LD C,A
  //   LD A,B
  //   CP '0'
  //   JR Z,skip_hundreds
  //   PUSH BC
  //   CALL $0100        ; CHAR_OUT(hundreds digit)
  //   POP BC
  //   ; Set flag so tens always prints
  //   LD A,'0'-1        ; signal tens must print
  //   JR do_tens
  // skip_hundreds:
  //   LD A,0            ; signal: suppress leading zero in tens
  // do_tens:
  //   PUSH AF           ; save leading-zero flag
  //   LD A,C            ; restore remainder
  //   LD B,'0'-1
  // tens:
  //   INC B
  //   SUB 10
  //   JR NC,tens
  //   ADD A,10
  //   ; B = tens digit, A = ones value
  //   LD C,A            ; save ones
  //   POP AF            ; check if we printed hundreds
  //   OR A
  //   JR NZ,print_tens  ; if hundreds printed, always print tens
  //   LD A,B
  //   CP '0'
  //   JR Z,skip_tens    ; suppress leading zero
  // print_tens:
  //   LD A,B
  //   PUSH BC
  //   CALL $0100        ; CHAR_OUT(tens digit)
  //   POP BC
  // skip_tens:
  //   LD A,C
  //   ADD A,'0'         ; ones digit is always printed
  //   CALL $0100        ; CHAR_OUT(ones digit)
  //   RET
  // ============================================================
  // This is complex to hand-assemble, so let's use a simpler approach:
  // PRINT_NUM: Convert A to up to 3 ASCII digits, suppress leading zeros.
  p = 0x120;
  // Save original value
  rom[p++] = 0x4f;                                     // LD C,A (save number)
  rom[p++] = 0x06; rom[p++] = 0x2f;                   // LD B,'0'-1 (= $2F)
  // Hundreds loop
  const hundreds_loop = p;
  rom[p++] = 0x04;                                     // INC B
  rom[p++] = 0xd6; rom[p++] = 0x64;                   // SUB 100
  rom[p++] = 0x30; rom[p++] = (hundreds_loop - p) & 0xff; // JR NC,hundreds_loop
  rom[p++] = 0xc6; rom[p++] = 0x64;                   // ADD A,100 (restore)
  rom[p++] = 0x4f;                                     // LD C,A (save remainder)
  rom[p++] = 0x78;                                     // LD A,B
  rom[p++] = 0xfe; rom[p++] = 0x30;                   // CP '0'
  const skip_hundreds_jr = p;
  rom[p++] = 0x28; rom[p++] = 0x00;                   // JR Z,skip_hundreds (patch later)
  // Print hundreds digit
  rom[p++] = 0xc5;                                     // PUSH BC
  rom[p++] = 0xcd; rom[p++] = 0x00; rom[p++] = 0x01; // CALL CHAR_OUT
  rom[p++] = 0xc1;                                     // POP BC
  rom[p++] = 0x3e; rom[p++] = 0x01;                   // LD A,1 (flag: printed hundreds)
  const to_do_tens = p;
  rom[p++] = 0x18; rom[p++] = 0x00;                   // JR do_tens (patch later)
  // skip_hundreds:
  const skip_hundreds = p;
  rom[skip_hundreds_jr + 1] = (skip_hundreds - (skip_hundreds_jr + 2)) & 0xff;
  rom[p++] = 0x3e; rom[p++] = 0x00;                   // LD A,0 (flag: no hundreds)
  // do_tens:
  const do_tens = p;
  rom[to_do_tens + 1] = (do_tens - (to_do_tens + 2)) & 0xff;
  rom[p++] = 0xf5;                                     // PUSH AF (save flag)
  rom[p++] = 0x79;                                     // LD A,C (remainder)
  rom[p++] = 0x06; rom[p++] = 0x2f;                   // LD B,'0'-1
  // Tens loop
  const tens_loop = p;
  rom[p++] = 0x04;                                     // INC B
  rom[p++] = 0xd6; rom[p++] = 0x0a;                   // SUB 10
  rom[p++] = 0x30; rom[p++] = (tens_loop - p) & 0xff; // JR NC,tens_loop
  rom[p++] = 0xc6; rom[p++] = 0x0a;                   // ADD A,10 (restore)
  rom[p++] = 0x4f;                                     // LD C,A (save ones)
  rom[p++] = 0xf1;                                     // POP AF (check flag)
  rom[p++] = 0xb7;                                     // OR A
  const print_tens_jr = p;
  rom[p++] = 0x20; rom[p++] = 0x00;                   // JR NZ,print_tens (patch)
  rom[p++] = 0x78;                                     // LD A,B (tens digit)
  rom[p++] = 0xfe; rom[p++] = 0x30;                   // CP '0'
  const skip_tens_jr = p;
  rom[p++] = 0x28; rom[p++] = 0x00;                   // JR Z,skip_tens (patch)
  // print_tens:
  const print_tens = p;
  rom[print_tens_jr + 1] = (print_tens - (print_tens_jr + 2)) & 0xff;
  rom[p++] = 0x78;                                     // LD A,B
  rom[p++] = 0xc5;                                     // PUSH BC
  rom[p++] = 0xcd; rom[p++] = 0x00; rom[p++] = 0x01; // CALL CHAR_OUT
  rom[p++] = 0xc1;                                     // POP BC
  // skip_tens:
  const skip_tens = p;
  rom[skip_tens_jr + 1] = (skip_tens - (skip_tens_jr + 2)) & 0xff;
  rom[p++] = 0x79;                                     // LD A,C (ones)
  rom[p++] = 0xc6; rom[p++] = 0x30;                   // ADD A,'0'
  rom[p++] = 0xcd; rom[p++] = 0x00; rom[p++] = 0x01; // CALL CHAR_OUT
  rom[p++] = 0xc9;                                     // RET

  // ============================================================
  // NEWLINE at $0180: Move cursor to start of next row.
  //   LD HL,($4000)    ; current cursor
  //   LD A,L
  //   AND $C0          ; mask to row start (clear lower 6 bits)
  //   ADD A,$40        ; advance one row (64 bytes)
  //   LD L,A
  //   JR NC,no_carry
  //   INC H
  // no_carry:
  //   LD ($4000),HL
  //   RET
  // ============================================================
  p = 0x180;
  rom[p++] = 0x2a; rom[p++] = 0x00; rom[p++] = 0x40; // LD HL,($4000)
  rom[p++] = 0x7d;                                     // LD A,L
  rom[p++] = 0xe6; rom[p++] = 0xc0;                   // AND $C0
  rom[p++] = 0xc6; rom[p++] = 0x40;                   // ADD A,$40
  rom[p++] = 0x6f;                                     // LD L,A
  rom[p++] = 0x30; rom[p++] = 0x01;                   // JR NC,+1
  rom[p++] = 0x24;                                     // INC H
  rom[p++] = 0x22; rom[p++] = 0x00; rom[p++] = 0x40; // LD ($4000),HL
  rom[p++] = 0xc9;                                     // RET

  // Helper to emit bytes at a given offset, returns next offset
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

describe('BASIC program integration tests', () => {
  let system: TRS80System;

  beforeEach(() => {
    system = new TRS80System();
  });

  describe('PRINT string output', () => {
    it('should display "HELLO WORLD" via PRINT subroutine', () => {
      const { rom, emit } = createBasicROM();

      // String at $0200
      putString(rom, 0x200, 'HELLO WORLD');

      // Main program: init stack/cursor, print string, halt
      let p = 0;
      p = emit(p, 0x31, 0xff, 0xff);       // LD SP,$FFFF
      p = emit(p, 0x21, 0x00, 0x3c);       // LD HL,$3C00
      p = emit(p, 0x22, 0x00, 0x40);       // LD ($4000),HL
      p = emit(p, 0x21, 0x00, 0x02);       // LD HL,$0200 (string ptr)
      // print_loop:
      const loop = p;
      p = emit(p, 0x7e);                   // LD A,(HL)
      p = emit(p, 0xb7);                   // OR A
      p = emit(p, 0xca); const jp_done = p; p = emit(p, 0x00, 0x00); // JP Z,done (patch)
      p = emit(p, 0xe5);                   // PUSH HL
      p = emit(p, 0xcd, 0x00, 0x01);       // CALL CHAR_OUT
      p = emit(p, 0xe1);                   // POP HL
      p = emit(p, 0x23);                   // INC HL
      p = emit(p, 0xc3, loop & 0xff, (loop >> 8) & 0xff); // JP loop
      // done:
      rom[jp_done] = p & 0xff;
      rom[jp_done + 1] = (p >> 8) & 0xff;
      p = emit(p, 0x76);                   // HALT

      system.loadROM(rom);
      system.reset();
      system.run(50_000);

      expect(system.isHalted()).toBe(true);
      expect(system.video.getRow(0).substring(0, 11)).toBe('HELLO WORLD');
    });

    it('should display multiple lines via NEWLINE subroutine', () => {
      const { rom, emit } = createBasicROM();

      putString(rom, 0x200, 'LINE 1');
      putString(rom, 0x210, 'LINE 2');
      putString(rom, 0x220, 'LINE 3');

      // Main: init, print line1, newline, print line2, newline, print line3, halt
      let p = 0;
      p = emit(p, 0x31, 0xff, 0xff);       // LD SP,$FFFF
      p = emit(p, 0x21, 0x00, 0x3c);       // LD HL,$3C00
      p = emit(p, 0x22, 0x00, 0x40);       // LD ($4000),HL

      // Print "LINE 1"
      p = emit(p, 0x21, 0x00, 0x02);       // LD HL,$0200
      p = emitPrintString(rom, p);
      p = emit(p, 0xcd, 0x80, 0x01);       // CALL NEWLINE

      // Print "LINE 2"
      p = emit(p, 0x21, 0x10, 0x02);       // LD HL,$0210
      p = emitPrintString(rom, p);
      p = emit(p, 0xcd, 0x80, 0x01);       // CALL NEWLINE

      // Print "LINE 3"
      p = emit(p, 0x21, 0x20, 0x02);       // LD HL,$0220
      p = emitPrintString(rom, p);

      p = emit(p, 0x76);                   // HALT

      system.loadROM(rom);
      system.reset();
      system.run(100_000);

      expect(system.isHalted()).toBe(true);
      expect(system.video.getRow(0).substring(0, 6)).toBe('LINE 1');
      expect(system.video.getRow(1).substring(0, 6)).toBe('LINE 2');
      expect(system.video.getRow(2).substring(0, 6)).toBe('LINE 3');
    });
  });

  describe('arithmetic and PRINT number', () => {
    it('should compute and display 2+2=4', () => {
      const { rom, emit } = createBasicROM();

      // Main: init, compute 2+2, print result
      let p = 0;
      p = emit(p, 0x31, 0xff, 0xff);       // LD SP,$FFFF
      p = emit(p, 0x21, 0x00, 0x3c);       // LD HL,$3C00
      p = emit(p, 0x22, 0x00, 0x40);       // LD ($4000),HL
      p = emit(p, 0x3e, 0x02);             // LD A,2
      p = emit(p, 0xc6, 0x02);             // ADD A,2
      p = emit(p, 0xcd, 0x20, 0x01);       // CALL PRINT_NUM
      p = emit(p, 0x76);                   // HALT

      system.loadROM(rom);
      system.reset();
      system.run(50_000);

      expect(system.isHalted()).toBe(true);
      expect(system.video.getRow(0).trimEnd().startsWith('4')).toBe(true);
    });

    it('should compute and display 7*8=56', () => {
      const { rom, emit } = createBasicROM();

      // Main: init, compute 7*8 via repeated addition
      let p = 0;
      p = emit(p, 0x31, 0xff, 0xff);       // LD SP,$FFFF
      p = emit(p, 0x21, 0x00, 0x3c);       // LD HL,$3C00
      p = emit(p, 0x22, 0x00, 0x40);       // LD ($4000),HL
      // 7 * 8: A=0, add 7 eight times
      p = emit(p, 0x3e, 0x00);             // LD A,0
      p = emit(p, 0x06, 0x08);             // LD B,8
      const mul_loop = p;
      p = emit(p, 0xc6, 0x07);             // ADD A,7
      p = emit(p, 0x10, (mul_loop - (p + 2)) & 0xff); // DJNZ mul_loop
      p = emit(p, 0xcd, 0x20, 0x01);       // CALL PRINT_NUM
      p = emit(p, 0x76);                   // HALT

      system.loadROM(rom);
      system.reset();
      system.run(50_000);

      expect(system.isHalted()).toBe(true);
      const row0 = system.video.getRow(0).trimEnd();
      expect(row0.startsWith('56')).toBe(true);
    });

    it('should display 100 (three-digit number)', () => {
      const { rom, emit } = createBasicROM();

      let p = 0;
      p = emit(p, 0x31, 0xff, 0xff);       // LD SP,$FFFF
      p = emit(p, 0x21, 0x00, 0x3c);       // LD HL,$3C00
      p = emit(p, 0x22, 0x00, 0x40);       // LD ($4000),HL
      p = emit(p, 0x3e, 0x64);             // LD A,100
      p = emit(p, 0xcd, 0x20, 0x01);       // CALL PRINT_NUM
      p = emit(p, 0x76);                   // HALT

      system.loadROM(rom);
      system.reset();
      system.run(50_000);

      expect(system.isHalted()).toBe(true);
      expect(system.video.getRow(0).substring(0, 3)).toBe('100');
    });
  });

  describe('FOR loop simulation', () => {
    it('should print numbers 1 through 5 (FOR I=1 TO 5)', () => {
      const { rom, emit } = createBasicROM();

      // Simulates: FOR I=1 TO 5: PRINT I: NEXT
      // Uses register C as loop counter, B as limit
      let p = 0;
      p = emit(p, 0x31, 0xff, 0xff);       // LD SP,$FFFF
      p = emit(p, 0x21, 0x00, 0x3c);       // LD HL,$3C00
      p = emit(p, 0x22, 0x00, 0x40);       // LD ($4000),HL
      p = emit(p, 0x0e, 0x01);             // LD C,1 (I=1)
      p = emit(p, 0x06, 0x05);             // LD B,5 (limit)
      // for_loop:
      const for_loop = p;
      p = emit(p, 0x79);                   // LD A,C (A=I)
      p = emit(p, 0xc5);                   // PUSH BC
      p = emit(p, 0xcd, 0x20, 0x01);       // CALL PRINT_NUM
      // Print space separator
      p = emit(p, 0x3e, 0x20);             // LD A,' '
      p = emit(p, 0xcd, 0x00, 0x01);       // CALL CHAR_OUT
      p = emit(p, 0xc1);                   // POP BC
      p = emit(p, 0x0c);                   // INC C (NEXT I)
      p = emit(p, 0x79);                   // LD A,C
      p = emit(p, 0xb8);                   // CP B
      const jr_le = p;
      p = emit(p, 0x38, (for_loop - (p + 2)) & 0xff); // JR C,for_loop (C < B)
      // Also run when C == B (need <= comparison)
      p = emit(p, 0x28, (for_loop - (p + 2)) & 0xff); // JR Z,for_loop (C == B)
      p = emit(p, 0x76);                   // HALT

      system.loadROM(rom);
      system.reset();
      system.run(100_000);

      expect(system.isHalted()).toBe(true);
      const row0 = system.video.getRow(0).trimEnd();
      // Should contain "1 2 3 4 5"
      expect(row0).toContain('1');
      expect(row0).toContain('2');
      expect(row0).toContain('3');
      expect(row0).toContain('4');
      expect(row0).toContain('5');
      // Verify correct order
      expect(row0.indexOf('1')).toBeLessThan(row0.indexOf('2'));
      expect(row0.indexOf('4')).toBeLessThan(row0.indexOf('5'));
    });

    it('should print numbers 1 through 10 (two-digit handling)', () => {
      const { rom, emit } = createBasicROM();

      // FOR I=1 TO 10: PRINT I: NEXT
      let p = 0;
      p = emit(p, 0x31, 0xff, 0xff);       // LD SP,$FFFF
      p = emit(p, 0x21, 0x00, 0x3c);       // LD HL,$3C00
      p = emit(p, 0x22, 0x00, 0x40);       // LD ($4000),HL
      p = emit(p, 0x0e, 0x01);             // LD C,1
      p = emit(p, 0x06, 0x0a);             // LD B,10
      const for_loop = p;
      p = emit(p, 0x79);                   // LD A,C
      p = emit(p, 0xc5);                   // PUSH BC
      p = emit(p, 0xcd, 0x20, 0x01);       // CALL PRINT_NUM
      p = emit(p, 0x3e, 0x20);             // LD A,' '
      p = emit(p, 0xcd, 0x00, 0x01);       // CALL CHAR_OUT
      p = emit(p, 0xc1);                   // POP BC
      p = emit(p, 0x0c);                   // INC C
      p = emit(p, 0x79);                   // LD A,C
      p = emit(p, 0xb8);                   // CP B
      p = emit(p, 0x38, (for_loop - (p + 2)) & 0xff); // JR C,for_loop
      p = emit(p, 0x28, (for_loop - (p + 2)) & 0xff); // JR Z,for_loop
      p = emit(p, 0x76);                   // HALT

      system.loadROM(rom);
      system.reset();
      system.run(200_000);

      expect(system.isHalted()).toBe(true);
      const row0 = system.video.getRow(0).trimEnd();
      expect(row0).toContain('10');
      // Check 1 appears before 10
      expect(row0.startsWith('1 ')).toBe(true);
    });
  });

  describe('nested loop simulation', () => {
    it('should compute multiplication table (FOR I=1 TO 3: FOR J=1 TO 2: PRINT I*J)', () => {
      const { rom, emit } = createBasicROM();

      // Simulates nested FOR loops with I*J computed via repeated addition.
      // Outer: I=1 to 3, Inner: J=1 to 2
      // Expected output per row: I*1 I*2
      // Row 0: 1 2
      // Row 1: 2 4
      // Row 2: 3 6
      let p = 0;
      p = emit(p, 0x31, 0xff, 0xff);       // LD SP,$FFFF
      p = emit(p, 0x21, 0x00, 0x3c);       // LD HL,$3C00
      p = emit(p, 0x22, 0x00, 0x40);       // LD ($4000),HL

      // Store I at $4010, J at $4011
      p = emit(p, 0x3e, 0x01);             // LD A,1
      p = emit(p, 0x32, 0x10, 0x40);       // LD ($4010),A  ; I=1
      // outer_loop:
      const outer_loop = p;
      p = emit(p, 0x3e, 0x01);             // LD A,1
      p = emit(p, 0x32, 0x11, 0x40);       // LD ($4011),A  ; J=1
      // inner_loop:
      const inner_loop = p;
      // Compute I*J via repeated addition: result = 0, add I J times
      p = emit(p, 0x3a, 0x10, 0x40);       // LD A,($4010) ; A=I
      p = emit(p, 0x47);                   // LD B,A        ; B=I
      p = emit(p, 0x3a, 0x11, 0x40);       // LD A,($4011) ; A=J (loop count)
      p = emit(p, 0x4f);                   // LD C,A        ; C=J
      p = emit(p, 0x3e, 0x00);             // LD A,0        ; accumulator
      // mul_loop:
      const mul_loop = p;
      p = emit(p, 0x80);                   // ADD A,B       ; A += I
      p = emit(p, 0x0d);                   // DEC C
      p = emit(p, 0x20, (mul_loop - (p + 2)) & 0xff); // JR NZ,mul_loop
      // A now has I*J, print it
      p = emit(p, 0xcd, 0x20, 0x01);       // CALL PRINT_NUM
      // Print space
      p = emit(p, 0x3e, 0x20);             // LD A,' '
      p = emit(p, 0xcd, 0x00, 0x01);       // CALL CHAR_OUT
      // NEXT J
      p = emit(p, 0x3a, 0x11, 0x40);       // LD A,($4011)
      p = emit(p, 0x3c);                   // INC A
      p = emit(p, 0x32, 0x11, 0x40);       // LD ($4011),A
      p = emit(p, 0xfe, 0x03);             // CP 3 (J > 2?)
      p = emit(p, 0x38, (inner_loop - (p + 2)) & 0xff); // JR C,inner_loop
      // NEWLINE
      p = emit(p, 0xcd, 0x80, 0x01);       // CALL NEWLINE
      // NEXT I
      p = emit(p, 0x3a, 0x10, 0x40);       // LD A,($4010)
      p = emit(p, 0x3c);                   // INC A
      p = emit(p, 0x32, 0x10, 0x40);       // LD ($4010),A
      p = emit(p, 0xfe, 0x04);             // CP 4 (I > 3?)
      p = emit(p, 0x38, (outer_loop - (p + 2)) & 0xff); // JR C,outer_loop
      p = emit(p, 0x76);                   // HALT

      system.loadROM(rom);
      system.reset();
      system.run(500_000);

      expect(system.isHalted()).toBe(true);
      // Row 0: "1 2" (1*1=1, 1*2=2)
      // Row 1: "2 4" (2*1=2, 2*2=4)
      // Row 2: "3 6" (3*1=3, 3*2=6)
      // Use substring since uninitialized VRAM (0x00) shows as '@'
      expect(system.video.getRow(0).substring(0, 3)).toBe('1 2');
      expect(system.video.getRow(1).substring(0, 3)).toBe('2 4');
      expect(system.video.getRow(2).substring(0, 3)).toBe('3 6');
    });
  });

  describe('GOTO simulation', () => {
    it('should jump backwards to create a counted loop (GOTO pattern)', () => {
      const { rom, emit } = createBasicROM();

      // Simulates:
      //   10 LET A=0
      //   20 A=A+1
      //   30 PRINT A
      //   40 IF A<3 GOTO 20
      //   50 END
      let p = 0;
      p = emit(p, 0x31, 0xff, 0xff);       // LD SP,$FFFF
      p = emit(p, 0x21, 0x00, 0x3c);       // LD HL,$3C00
      p = emit(p, 0x22, 0x00, 0x40);       // LD ($4000),HL
      // Line 10: LET A=0
      p = emit(p, 0x3e, 0x00);             // LD A,0
      p = emit(p, 0x32, 0x10, 0x40);       // LD ($4010),A
      // Line 20: A=A+1
      const line20 = p;
      p = emit(p, 0x3a, 0x10, 0x40);       // LD A,($4010)
      p = emit(p, 0x3c);                   // INC A
      p = emit(p, 0x32, 0x10, 0x40);       // LD ($4010),A
      // Line 30: PRINT A
      p = emit(p, 0xcd, 0x20, 0x01);       // CALL PRINT_NUM
      p = emit(p, 0x3e, 0x20);             // LD A,' '
      p = emit(p, 0xcd, 0x00, 0x01);       // CALL CHAR_OUT
      // Line 40: IF A<3 GOTO 20
      p = emit(p, 0x3a, 0x10, 0x40);       // LD A,($4010)
      p = emit(p, 0xfe, 0x03);             // CP 3
      p = emit(p, 0x38, (line20 - (p + 2)) & 0xff); // JR C,line20
      // Line 50: END
      p = emit(p, 0x76);                   // HALT

      system.loadROM(rom);
      system.reset();
      system.run(100_000);

      expect(system.isHalted()).toBe(true);
      // Use substring since uninitialized VRAM (0x00) shows as '@'
      expect(system.video.getRow(0).substring(0, 5)).toBe('1 2 3');
    });
  });

  describe('GOSUB/RETURN simulation', () => {
    it('should call subroutine and return (GOSUB pattern)', () => {
      const { rom, emit } = createBasicROM();

      // Simulates:
      //   10 GOSUB 100  (prints "AB")
      //   20 GOSUB 100  (prints "AB" again)
      //   30 END
      //   100 PRINT "AB": RETURN
      putString(rom, 0x200, 'AB');

      // Subroutine at $0050: print "AB" and return
      let sub = 0x50;
      rom[sub++] = 0x21; rom[sub++] = 0x00; rom[sub++] = 0x02; // LD HL,$0200
      sub = emitPrintString(rom, sub);
      rom[sub++] = 0xc9; // RET

      let p = 0;
      p = emit(p, 0x31, 0xff, 0xff);       // LD SP,$FFFF
      p = emit(p, 0x21, 0x00, 0x3c);       // LD HL,$3C00
      p = emit(p, 0x22, 0x00, 0x40);       // LD ($4000),HL
      p = emit(p, 0xcd, 0x50, 0x00);       // CALL $0050 (GOSUB 100)
      p = emit(p, 0xcd, 0x50, 0x00);       // CALL $0050 (GOSUB 100)
      p = emit(p, 0x76);                   // HALT

      system.loadROM(rom);
      system.reset();
      system.run(50_000);

      expect(system.isHalted()).toBe(true);
      expect(system.video.getRow(0).substring(0, 4)).toBe('ABAB');
    });
  });

  describe('variable storage and retrieval', () => {
    it('should store and add two variables (A=10, B=20, PRINT A+B)', () => {
      const { rom, emit } = createBasicROM();

      let p = 0;
      p = emit(p, 0x31, 0xff, 0xff);       // LD SP,$FFFF
      p = emit(p, 0x21, 0x00, 0x3c);       // LD HL,$3C00
      p = emit(p, 0x22, 0x00, 0x40);       // LD ($4000),HL
      // A=10 at $4010
      p = emit(p, 0x3e, 0x0a);             // LD A,10
      p = emit(p, 0x32, 0x10, 0x40);       // LD ($4010),A
      // B=20 at $4011
      p = emit(p, 0x3e, 0x14);             // LD A,20
      p = emit(p, 0x32, 0x11, 0x40);       // LD ($4011),A
      // PRINT A+B
      p = emit(p, 0x3a, 0x10, 0x40);       // LD A,($4010)
      p = emit(p, 0x47);                   // LD B,A
      p = emit(p, 0x3a, 0x11, 0x40);       // LD A,($4011)
      p = emit(p, 0x80);                   // ADD A,B
      p = emit(p, 0xcd, 0x20, 0x01);       // CALL PRINT_NUM
      p = emit(p, 0x76);                   // HALT

      system.loadROM(rom);
      system.reset();
      system.run(50_000);

      expect(system.isHalted()).toBe(true);
      expect(system.video.getRow(0).substring(0, 2)).toBe('30');
    });
  });
});

/**
 * Helper: emit a print-string loop inline at the given ROM offset.
 * Expects HL to point to a null-terminated string.
 * Returns the offset after the emitted code.
 */
function emitPrintString(rom: Uint8Array, p: number): number {
  // loop:
  const loop = p;
  rom[p++] = 0x7e;                                     // LD A,(HL)
  rom[p++] = 0xb7;                                     // OR A
  // JR Z,done (relative jump forward — will patch)
  const jr_done = p;
  rom[p++] = 0x28; rom[p++] = 0x00;                   // JR Z,done (patch)
  rom[p++] = 0xe5;                                     // PUSH HL
  rom[p++] = 0xcd; rom[p++] = 0x00; rom[p++] = 0x01; // CALL CHAR_OUT
  rom[p++] = 0xe1;                                     // POP HL
  rom[p++] = 0x23;                                     // INC HL
  rom[p++] = 0x18; rom[p++] = (loop - p) & 0xff; // JR loop
  // done:
  const done = p;
  rom[jr_done + 1] = (done - (jr_done + 2)) & 0xff;
  return p;
}

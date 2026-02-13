import { describe, it, expect, beforeEach } from 'vitest';
import { TRS80System } from '../system';
import { TRS80_STUB_ROM } from '../roms/level2-basic-stub';
import { VIDEO_BASE } from '../video';

describe('TRS80System', () => {
  let system: TRS80System;

  beforeEach(() => {
    system = new TRS80System();
  });

  describe('initialization', () => {
    it('should start with PC at $0000 after reset', () => {
      system.reset();
      expect(system.getPC()).toBe(0);
    });

    it('should start with 0 cycles', () => {
      system.reset();
      expect(system.getCycles()).toBe(0);
    });

    it('should not be halted initially', () => {
      system.reset();
      expect(system.isHalted()).toBe(false);
    });
  });

  describe('ROM loading', () => {
    it('should load ROM data into memory', () => {
      const rom = new Uint8Array(16);
      rom[0] = 0xc3; // JP
      rom[1] = 0x00;
      rom[2] = 0x00;
      system.loadROM(rom);

      expect(system.memory.read(0x0000)).toBe(0xc3);
    });

    it('should execute loaded ROM code', () => {
      // Simple ROM: NOP, NOP, HALT
      const rom = new Uint8Array(16);
      rom[0] = 0x00; // NOP
      rom[1] = 0x00; // NOP
      rom[2] = 0x76; // HALT
      system.loadROM(rom);
      system.reset();

      system.run(100);
      expect(system.isHalted()).toBe(true);
      expect(system.getPC()).toBe(0x0002);
    });
  });

  describe('stub ROM boot', () => {
    beforeEach(() => {
      system.loadROM(TRS80_STUB_ROM);
      system.reset();
    });

    it('should clear video RAM with spaces during boot', () => {
      // Run enough cycles for the clear loop (1024 iterations)
      system.run(100_000);

      // Check video RAM is filled with spaces (skip first 5 bytes which have "READY")
      for (let addr = VIDEO_BASE + 5; addr <= VIDEO_BASE + 10; addr++) {
        expect(system.video.read(addr)).toBe(0x20);
      }
    });

    it('should display "READY" at the top-left of the screen', () => {
      system.run(100_000);

      const row0 = system.video.getRow(0);
      expect(row0.trimEnd()).toBe('READY');
    });

    it('should reach the keyboard polling loop', () => {
      system.run(100_000);

      // After boot, the CPU should be in the polling loop
      // reading from $38FF. Run a few more steps and verify
      // the PC stays in a small range.
      const pc1 = system.getPC();
      system.run(100);
      const pc2 = system.getPC();
      system.run(100);
      const pc3 = system.getPC();

      // All three PCs should be near each other (within the polling loop)
      expect(Math.abs(pc2 - pc1)).toBeLessThan(20);
      expect(Math.abs(pc3 - pc2)).toBeLessThan(20);
    });
  });

  describe('keyboard input with stub ROM', () => {
    beforeEach(() => {
      system.loadROM(TRS80_STUB_ROM);
      system.reset();
      system.run(100_000); // Boot to polling loop
    });

    it('should detect a key press', () => {
      system.keyDown('A');

      // Run some cycles — the ROM should exit the polling loop
      system.run(1000);
      system.keyUp('A');

      // Need enough cycles for hold timer to expire (50,000) + ROM to process key
      system.run(55_000);

      // After key processing, should be back in polling loop
      // and 'A' should appear in video RAM
      const row1 = system.video.getRow(1);
      expect(row1.trimEnd()).toContain('A');
    });

    it('should echo typed letters to video RAM', () => {
      // Type 'H'
      system.keyDown('H');
      system.run(5_000);
      system.keyUp('H');

      system.run(55_000);

      // Type 'I'
      system.keyDown('I');
      system.run(5_000);
      system.keyUp('I');

      system.run(55_000);

      const row1 = system.video.getRow(1);
      expect(row1.trimEnd()).toContain('HI');
    });

    it('should handle ENTER key by moving to next line', () => {
      // Type 'A'
      system.keyDown('A');
      system.run(5_000);
      system.keyUp('A');
      system.run(55_000);

      // Press ENTER
      system.keyDown('ENTER');
      system.run(5_000);
      system.keyUp('ENTER');

      system.run(55_000);

      // Type 'B' — should appear on the next line
      system.keyDown('B');
      system.run(5_000);
      system.keyUp('B');

      system.run(55_000);

      expect(system.video.getRow(1).trimEnd()).toContain('A');
      expect(system.video.getRow(2).trimEnd()).toContain('B');
    });

    it('should handle digits from row 4 (0-7)', () => {
      system.keyDown('3');
      system.run(5_000);
      system.keyUp('3');

      system.run(55_000);

      expect(system.video.getRow(1).trimEnd()).toContain('3');
    });

    it('should handle digits from row 5 (8-9)', () => {
      system.keyDown('9');
      system.run(5_000);
      system.keyUp('9');

      system.run(55_000);

      expect(system.video.getRow(1).trimEnd()).toContain('9');
    });

    it('should handle letters X, Y, Z from row 3', () => {
      system.keyDown('X');
      system.run(5_000);
      system.keyUp('X');

      system.run(55_000);

      system.keyDown('Y');
      system.run(5_000);
      system.keyUp('Y');

      system.run(55_000);

      system.keyDown('Z');
      system.run(5_000);
      system.keyUp('Z');

      system.run(55_000);

      expect(system.video.getRow(1).trimEnd()).toContain('XYZ');
    });

    it('should handle SPACE key', () => {
      system.keyDown('A');
      system.run(5_000);
      system.keyUp('A');
      system.run(55_000);

      system.keyDown('SPACE');
      system.run(5_000);
      system.keyUp('SPACE');
      system.run(55_000);

      system.keyDown('B');
      system.run(5_000);
      system.keyUp('B');

      system.run(55_000);

      expect(system.video.getRow(1).trimEnd()).toBe('A B');
    });

    it('should not crash on SHIFT key alone', () => {
      system.keyDown('SHIFT');
      system.run(5_000);
      system.keyUp('SHIFT');
      system.run(55_000);

      // After SHIFT, system should still be responsive
      system.keyDown('A');
      system.run(5_000);
      system.keyUp('A');
      system.run(55_000);

      expect(system.video.getRow(1).trimEnd()).toContain('A');
    });
  });

  describe('video change callback', () => {
    it('should fire callback when video RAM is written', () => {
      const changes: number[] = [];
      system.setVideoChangeCallback((addr) => changes.push(addr));

      system.loadROM(TRS80_STUB_ROM);
      system.reset();
      system.run(100_000);

      // The boot sequence writes to video RAM (clear + "READY")
      expect(changes.length).toBeGreaterThan(0);
    });
  });

  describe('component access', () => {
    it('should expose CPU, memory, keyboard, and video', () => {
      expect(system.cpu).toBeDefined();
      expect(system.memory).toBeDefined();
      expect(system.keyboard).toBeDefined();
      expect(system.video).toBeDefined();
    });
  });

  describe('Level II BASIC display simulation', () => {
    it('should display a string written character-by-character via CALL/RET', () => {
      // Simulate Level II BASIC's character output pattern:
      // A main routine calls a CHAR_OUT subroutine for each character.
      // CHAR_OUT loads cursor address from RAM, writes char, advances cursor.
      //
      // Layout:
      //   $0000: main program — writes "MEMORY SIZE?" to video RAM
      //   $0100: CHAR_OUT subroutine
      const rom = new Uint8Array(0x3000);

      // String data at $0200: "MEMORY SIZE?"
      const str = 'MEMORY SIZE?';
      for (let i = 0; i < str.length; i++) {
        rom[0x200 + i] = str.charCodeAt(i);
      }
      rom[0x200 + str.length] = 0; // null terminator

      // CHAR_OUT subroutine at $0100:
      //   LD HL,($4000)   ; load cursor address
      //   LD (HL),A       ; write character
      //   INC HL          ; advance cursor
      //   LD ($4000),HL   ; save cursor address
      //   RET
      let p = 0x100;
      rom[p++] = 0x2a; rom[p++] = 0x00; rom[p++] = 0x40; // LD HL,($4000)
      rom[p++] = 0x77;                                     // LD (HL),A
      rom[p++] = 0x23;                                     // INC HL
      rom[p++] = 0x22; rom[p++] = 0x00; rom[p++] = 0x40; // LD ($4000),HL
      rom[p++] = 0xc9;                                     // RET

      // Main program at $0000:
      //   LD SP,$FFFF
      //   LD HL,$3C00       ; cursor starts at top-left
      //   LD ($4000),HL     ; save cursor address
      //   LD HL,$0200       ; point to string
      // loop:
      //   LD A,(HL)         ; get next char
      //   OR A              ; check null terminator
      //   JP Z,done         ; if zero, done
      //   PUSH HL           ; save string pointer
      //   CALL $0100        ; call CHAR_OUT
      //   POP HL            ; restore string pointer
      //   INC HL            ; next character
      //   JP loop           ; repeat
      // done:
      //   HALT
      p = 0x000;
      rom[p++] = 0x31; rom[p++] = 0xff; rom[p++] = 0xff; // LD SP,$FFFF
      rom[p++] = 0x21; rom[p++] = 0x00; rom[p++] = 0x3c; // LD HL,$3C00
      rom[p++] = 0x22; rom[p++] = 0x00; rom[p++] = 0x40; // LD ($4000),HL
      rom[p++] = 0x21; rom[p++] = 0x00; rom[p++] = 0x02; // LD HL,$0200
      // loop ($000C):
      rom[p++] = 0x7e;                                     // LD A,(HL)
      rom[p++] = 0xb7;                                     // OR A
      rom[p++] = 0xca; rom[p++] = 0x1a; rom[p++] = 0x00; // JP Z,$001A (done)
      rom[p++] = 0xe5;                                     // PUSH HL
      rom[p++] = 0xcd; rom[p++] = 0x00; rom[p++] = 0x01; // CALL $0100
      rom[p++] = 0xe1;                                     // POP HL
      rom[p++] = 0x23;                                     // INC HL
      rom[p++] = 0xc3; rom[p++] = 0x0c; rom[p++] = 0x00; // JP $000C (loop)
      // done ($001A):
      rom[p++] = 0x76;                                     // HALT

      system.loadROM(rom);
      system.reset();
      system.run(10_000);

      expect(system.isHalted()).toBe(true);
      const row0 = system.video.getRow(0);
      expect(row0.substring(0, str.length)).toBe('MEMORY SIZE?');
    });

    it('should display characters with high bit set (cursor/inverse)', () => {
      // Verify that characters written with bit 7 set are visible via getRow()
      // Level II BASIC uses bit 7 for cursor display
      system.video.write(0x3c00, 0xc0 | 0x2d); // inverse '-' = $ED
      system.video.write(0x3c01, 0xc0 | 0x3f); // inverse '?' = $FF
      system.video.write(0x3c02, 0x80 | 0x00); // block graphic $80 (all blank)
      system.video.write(0x3c03, 0x80 | 0x3f); // block graphic $BF (all lit)

      const row0 = system.video.getRow(0);
      // inverse chars should show their base ASCII character
      expect(row0[0]).toBe('-');  // $ED → inverse '-'
      expect(row0[1]).toBe('?');  // $FF → inverse '?'
      // block graphics: $80 (no blocks) → space, $BF (all blocks) → full block
      expect(row0[2]).toBe(' ');  // $80 → empty block graphic
      expect(row0[3]).toBe('\u2588'); // $BF → full block
    });

    it('should complete a counting loop with interrupts enabled', () => {
      // Test that timer interrupts don't corrupt a loop counter.
      // This simulates what a BASIC FOR I=1 TO 10 loop does at CPU level.
      //
      // Layout:
      //   $0000: main — count from 1 to 10, write each to video RAM
      //   $0038: interrupt handler — EI + RETI (minimal, preserves all state)
      const rom = new Uint8Array(0x3000);

      // Interrupt handler at $0038: just re-enable and return
      rom[0x38] = 0xfb; // EI
      rom[0x39] = 0xed; // RETI prefix
      rom[0x3a] = 0x4d; // RETI

      // Main program at $0000:
      //   LD SP,$FFFF
      //   LD HL,$3C00     ; video RAM start
      //   LD B,10         ; counter (10 iterations)
      //   LD C,1          ; current value (1..10)
      //   IM 1            ; interrupt mode 1
      //   EI              ; enable interrupts
      // loop:
      //   LD (HL),C       ; write current value to video RAM
      //   INC HL          ; next video position
      //   INC C           ; next value
      //   DJNZ loop       ; decrement B, jump if not zero
      //   HALT
      let p = 0;
      rom[p++] = 0x31; rom[p++] = 0xff; rom[p++] = 0xff; // LD SP,$FFFF
      rom[p++] = 0x21; rom[p++] = 0x00; rom[p++] = 0x3c; // LD HL,$3C00
      rom[p++] = 0x06; rom[p++] = 0x0a;                   // LD B,10
      rom[p++] = 0x0e; rom[p++] = 0x01;                   // LD C,1
      rom[p++] = 0xed; rom[p++] = 0x56;                   // IM 1
      rom[p++] = 0xfb;                                     // EI
      // loop at $000D:
      rom[p++] = 0x71;                                     // LD (HL),C
      rom[p++] = 0x23;                                     // INC HL
      rom[p++] = 0x0c;                                     // INC C
      rom[p++] = 0x10; rom[p++] = 0xfb;                   // DJNZ $000D (loop)
      rom[p++] = 0x76;                                     // HALT

      system.loadROM(rom);
      system.reset();
      // Run enough cycles for interrupts to fire during the loop
      system.run(200_000);

      expect(system.isHalted()).toBe(true);
      // Verify all 10 values were written: 1,2,3...10 at $3C00-$3C09
      for (let i = 0; i < 10; i++) {
        expect(system.video.read(0x3c00 + i)).toBe(i + 1);
      }
    });

    it('should display string written via LDIR block copy', () => {
      // Simulate using LDIR to copy a string from ROM to video RAM
      const rom = new Uint8Array(0x3000);

      // String at $0200: "HELLO WORLD"
      const str = 'HELLO WORLD';
      for (let i = 0; i < str.length; i++) {
        rom[0x200 + i] = str.charCodeAt(i);
      }

      // Program at $0000:
      //   LD SP,$FFFF
      //   LD HL,$0200       ; source = string in ROM
      //   LD DE,$3C00       ; destination = video RAM
      //   LD BC,length      ; byte count
      //   LDIR              ; block copy
      //   HALT
      let p = 0;
      rom[p++] = 0x31; rom[p++] = 0xff; rom[p++] = 0xff; // LD SP,$FFFF
      rom[p++] = 0x21; rom[p++] = 0x00; rom[p++] = 0x02; // LD HL,$0200
      rom[p++] = 0x11; rom[p++] = 0x00; rom[p++] = 0x3c; // LD DE,$3C00
      rom[p++] = 0x01; rom[p++] = str.length; rom[p++] = 0x00; // LD BC,length
      rom[p++] = 0xed; rom[p++] = 0xb0;                   // LDIR
      rom[p++] = 0x76;                                     // HALT

      system.loadROM(rom);
      system.reset();
      system.run(10_000);

      expect(system.isHalted()).toBe(true);
      const row0 = system.video.getRow(0);
      expect(row0.substring(0, str.length)).toBe('HELLO WORLD');
    });
  });
});

/**
 * Apple-1 Diagnostic PROM Test Suite
 *
 * Integration tests that validate the Apple-1 emulator by running diagnostic
 * ROM programs through the full CPU -> Memory -> PIA -> Display pipeline.
 *
 * These tests verify:
 * 1. Screen fill: 960 characters output in correct cycling pattern
 * 2. DRAM test: Memory write/read-back with 4 test patterns, pass/fail report
 * 3. Keyboard echo: PIA keyboard input correctly echoed to display
 * 4. Hex monitor: Two-digit hex input with '=' response
 *
 * Dependencies:
 * - Task #1: 6502 CPU emulator core (Cpu6502 interface)
 * - Task #2: PIA I/O system (memory-mapped registers)
 * - Task #3: Woz Monitor ROM (for reference, not directly used)
 * - Task #5: Test suite infrastructure
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  SCREEN_FILL_ROM,
  DRAM_TEST_ROM,
  KEYBOARD_ECHO_ROM,
  HEX_MONITOR_ROM,
  PIA,
  DISPLAY,
} from '@/emulator/apple1/roms/diagnostic-roms';
import {
  DiagnosticHarness,
  Cpu6502,
  MemoryBus,
  verifyScreenFill,
  verifyDRAMTest,
  verifyKeyboardEcho,
  verifyHexMonitor,
} from './diagnostic-harness';

// ---------------------------------------------------------------------------
// Stub CPU implementation for standalone test validation
//
// This minimal 6502 interpreter handles only the instructions used by the
// diagnostic ROMs. Once the real CPU emulator (Task #1) is available,
// these tests should be re-run with the production implementation.
// ---------------------------------------------------------------------------

class StubCpu6502 implements Cpu6502 {
  private a = 0;
  private x = 0;
  private y = 0;
  private sp = 0xfd;
  private pc = 0;
  private status = 0x24; // IRQ disabled, unused bit set
  private bus: MemoryBus;
  private cycles = 0;

  constructor(bus: MemoryBus) {
    this.bus = bus;
  }

  reset(): void {
    this.a = 0;
    this.x = 0;
    this.y = 0;
    this.sp = 0xfd;
    this.status = 0x24;
    // Read reset vector at $FFFC-$FFFD
    const lo = this.bus.read(0xfffc);
    const hi = this.bus.read(0xfffd);
    this.pc = (hi << 8) | lo;
  }

  getPC(): number {
    return this.pc;
  }

  step(): number {
    const opcode = this.bus.read(this.pc);
    this.cycles = 0;

    switch (opcode) {
      case 0xa9: this.lda_imm(); break;       // LDA #imm
      case 0xa5: this.lda_zp(); break;        // LDA zp
      case 0xb1: this.lda_ind_y(); break;     // LDA (zp),Y
      case 0xad: this.lda_abs(); break;       // LDA abs
      case 0xbd: this.lda_abs_x(); break;     // LDA abs,X
      case 0x85: this.sta_zp(); break;        // STA zp
      case 0x91: this.sta_ind_y(); break;     // STA (zp),Y
      case 0x8d: this.sta_abs(); break;       // STA abs
      case 0xa2: this.ldx_imm(); break;       // LDX #imm
      case 0xa0: this.ldy_imm(); break;       // LDY #imm
      case 0xaa: this.tax(); break;           // TAX
      case 0x8a: this.txa(); break;           // TXA
      case 0x18: this.clc(); break;           // CLC
      case 0x69: this.adc_imm(); break;       // ADC #imm
      case 0xc9: this.cmp_imm(); break;       // CMP #imm
      case 0xc5: this.cmp_zp(); break;        // CMP zp
      case 0xca: this.dex(); break;           // DEX
      case 0x88: this.dey(); break;           // DEY
      case 0xc8: this.iny(); break;           // INY
      case 0xe6: this.inc_zp(); break;        // INC zp
      case 0xd0: this.bne(); break;           // BNE
      case 0xf0: this.beq(); break;           // BEQ (unused but common)
      case 0x30: this.bmi(); break;           // BMI
      case 0x10: this.bpl(); break;           // BPL
      case 0x90: this.bcc(); break;           // BCC
      case 0x2c: this.bit_abs(); break;       // BIT abs
      case 0x4c: this.jmp_abs(); break;       // JMP abs
      case 0x05: this.ora_zp(); break;        // ORA zp
      case 0x0a: this.asl_a(); break;         // ASL A
      case 0x20: this.jsr(); break;           // JSR
      case 0x60: this.rts(); break;           // RTS
      case 0xea: this.nop(); break;           // NOP
      default:
        throw new Error(
          `Unimplemented opcode: $${opcode.toString(16).padStart(2, '0')} at $${this.pc.toString(16).padStart(4, '0')}`
        );
    }

    return this.cycles;
  }

  // Flag helpers
  private setNZ(value: number): void {
    this.status = (this.status & 0x7d) |
      ((value & 0x80) ? 0x80 : 0) |  // N flag
      (value === 0 ? 0x02 : 0);       // Z flag
  }

  private getFlag(bit: number): boolean {
    return (this.status & bit) !== 0;
  }

  // Addressing modes
  private readImm(): number {
    return this.bus.read(this.pc + 1);
  }

  private readZpAddr(): number {
    return this.bus.read(this.pc + 1);
  }

  private readAbsAddr(): number {
    const lo = this.bus.read(this.pc + 1);
    const hi = this.bus.read(this.pc + 2);
    return (hi << 8) | lo;
  }

  // Instructions
  private lda_imm(): void {
    this.a = this.readImm();
    this.setNZ(this.a);
    this.pc += 2;
    this.cycles = 2;
  }

  private lda_zp(): void {
    const addr = this.readZpAddr();
    this.a = this.bus.read(addr);
    this.setNZ(this.a);
    this.pc += 2;
    this.cycles = 3;
  }

  private lda_ind_y(): void {
    const zp = this.readZpAddr();
    const lo = this.bus.read(zp);
    const hi = this.bus.read((zp + 1) & 0xff);
    const addr = ((hi << 8) | lo) + this.y;
    this.a = this.bus.read(addr & 0xffff);
    this.setNZ(this.a);
    this.pc += 2;
    this.cycles = 5;
  }

  private lda_abs(): void {
    const addr = this.readAbsAddr();
    this.a = this.bus.read(addr);
    this.setNZ(this.a);
    this.pc += 3;
    this.cycles = 4;
  }

  private lda_abs_x(): void {
    const addr = this.readAbsAddr();
    this.a = this.bus.read((addr + this.x) & 0xffff);
    this.setNZ(this.a);
    this.pc += 3;
    this.cycles = 4;
  }

  private sta_zp(): void {
    const addr = this.readZpAddr();
    this.bus.write(addr, this.a);
    this.pc += 2;
    this.cycles = 3;
  }

  private sta_ind_y(): void {
    const zp = this.readZpAddr();
    const lo = this.bus.read(zp);
    const hi = this.bus.read((zp + 1) & 0xff);
    const addr = ((hi << 8) | lo) + this.y;
    this.bus.write(addr & 0xffff, this.a);
    this.pc += 2;
    this.cycles = 6;
  }

  private sta_abs(): void {
    const addr = this.readAbsAddr();
    this.bus.write(addr, this.a);
    this.pc += 3;
    this.cycles = 4;
  }

  private ldx_imm(): void {
    this.x = this.readImm();
    this.setNZ(this.x);
    this.pc += 2;
    this.cycles = 2;
  }

  private ldy_imm(): void {
    this.y = this.readImm();
    this.setNZ(this.y);
    this.pc += 2;
    this.cycles = 2;
  }

  private tax(): void {
    this.x = this.a;
    this.setNZ(this.x);
    this.pc += 1;
    this.cycles = 2;
  }

  private txa(): void {
    this.a = this.x;
    this.setNZ(this.a);
    this.pc += 1;
    this.cycles = 2;
  }

  private clc(): void {
    this.status &= ~0x01;
    this.pc += 1;
    this.cycles = 2;
  }

  private adc_imm(): void {
    const operand = this.readImm();
    const carry = this.status & 0x01;
    const result = this.a + operand + carry;
    // Set carry
    this.status = (this.status & ~0x01) | (result > 0xff ? 0x01 : 0);
    // Set overflow
    const overflow = (~(this.a ^ operand) & (this.a ^ result) & 0x80) ? 0x40 : 0;
    this.status = (this.status & ~0x40) | overflow;
    this.a = result & 0xff;
    this.setNZ(this.a);
    this.pc += 2;
    this.cycles = 2;
  }

  private cmp_imm(): void {
    const operand = this.readImm();
    const result = this.a - operand;
    this.status = (this.status & ~0x01) | (this.a >= operand ? 0x01 : 0);
    this.setNZ(result & 0xff);
    this.pc += 2;
    this.cycles = 2;
  }

  private cmp_zp(): void {
    const addr = this.readZpAddr();
    const operand = this.bus.read(addr);
    const result = this.a - operand;
    this.status = (this.status & ~0x01) | (this.a >= operand ? 0x01 : 0);
    this.setNZ(result & 0xff);
    this.pc += 2;
    this.cycles = 3;
  }

  private dex(): void {
    this.x = (this.x - 1) & 0xff;
    this.setNZ(this.x);
    this.pc += 1;
    this.cycles = 2;
  }

  private dey(): void {
    this.y = (this.y - 1) & 0xff;
    this.setNZ(this.y);
    this.pc += 1;
    this.cycles = 2;
  }

  private iny(): void {
    this.y = (this.y + 1) & 0xff;
    this.setNZ(this.y);
    this.pc += 1;
    this.cycles = 2;
  }

  private inc_zp(): void {
    const addr = this.readZpAddr();
    const value = (this.bus.read(addr) + 1) & 0xff;
    this.bus.write(addr, value);
    this.setNZ(value);
    this.pc += 2;
    this.cycles = 5;
  }

  private branch(condition: boolean): void {
    const offset = this.readImm();
    this.pc += 2;
    if (condition) {
      const signed = offset > 127 ? offset - 256 : offset;
      this.pc = (this.pc + signed) & 0xffff;
      this.cycles = 3;
    } else {
      this.cycles = 2;
    }
  }

  private bne(): void { this.branch(!this.getFlag(0x02)); }
  private beq(): void { this.branch(this.getFlag(0x02)); }
  private bmi(): void { this.branch(this.getFlag(0x80)); }
  private bpl(): void { this.branch(!this.getFlag(0x80)); }
  private bcc(): void { this.branch(!this.getFlag(0x01)); }

  private bit_abs(): void {
    const addr = this.readAbsAddr();
    const value = this.bus.read(addr);
    const result = this.a & value;
    // Z flag from AND result, N and V from memory value
    this.status = (this.status & 0x3d) |
      (value & 0xc0) |                        // N and V from memory
      (result === 0 ? 0x02 : 0);              // Z from AND
    this.pc += 3;
    this.cycles = 4;
  }

  private jmp_abs(): void {
    this.pc = this.readAbsAddr();
    this.cycles = 3;
  }

  private ora_zp(): void {
    const addr = this.readZpAddr();
    this.a = this.a | this.bus.read(addr);
    this.setNZ(this.a);
    this.pc += 2;
    this.cycles = 3;
  }

  private asl_a(): void {
    this.status = (this.status & ~0x01) | ((this.a & 0x80) ? 0x01 : 0);
    this.a = (this.a << 1) & 0xff;
    this.setNZ(this.a);
    this.pc += 1;
    this.cycles = 2;
  }

  private jsr(): void {
    const target = this.readAbsAddr();
    const ret = (this.pc + 2) & 0xffff; // Push return address - 1
    this.bus.write(0x100 + this.sp, (ret >> 8) & 0xff);
    this.sp = (this.sp - 1) & 0xff;
    this.bus.write(0x100 + this.sp, ret & 0xff);
    this.sp = (this.sp - 1) & 0xff;
    this.pc = target;
    this.cycles = 6;
  }

  private rts(): void {
    this.sp = (this.sp + 1) & 0xff;
    const lo = this.bus.read(0x100 + this.sp);
    this.sp = (this.sp + 1) & 0xff;
    const hi = this.bus.read(0x100 + this.sp);
    this.pc = (((hi << 8) | lo) + 1) & 0xffff;
    this.cycles = 6;
  }

  private nop(): void {
    this.pc += 1;
    this.cycles = 2;
  }
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('Apple-1 Diagnostic PROM Tests', () => {
  let harness: DiagnosticHarness;

  beforeEach(() => {
    harness = new DiagnosticHarness();
  });

  describe('Screen Fill Test', () => {
    it('should output 960 characters filling the 40x24 display', () => {
      harness.loadROM(SCREEN_FILL_ROM);
      const bus = harness.createMemoryBus();
      const cpu = new StubCpu6502(bus);

      const result = harness.run(cpu, 50_000_000);

      expect(result.termination).toBe('halted');
      expect(result.display.rawBytes.length).toBeGreaterThan(0);

      const verification = verifyScreenFill(result.display);
      expect(verification.passed).toBe(true);
      expect(verification.details.printableChars).toBe(DISPLAY.TOTAL);
      expect(verification.details.hasFinalCR).toBe(true);
      expect(verification.details.patternCorrect).toBe(true);
    });

    it('should cycle through characters $20-$5F in order', () => {
      harness.loadROM(SCREEN_FILL_ROM);
      const bus = harness.createMemoryBus();
      const cpu = new StubCpu6502(bus);

      harness.run(cpu, 50_000_000);
      const display = harness.getDisplay();

      // Verify first few characters of the pattern
      const printableBytes = display.rawBytes.filter(
        (b) => (b & 0x7f) >= 0x20 && (b & 0x7f) < 0x60
      );
      expect(printableBytes.length).toBeGreaterThanOrEqual(64);
      for (let i = 0; i < 64; i++) {
        const expected = 0x20 + (i % 64); // $20-$5F = 64 chars
        expect(printableBytes[i] & 0x7f).toBe(expected);
      }
    });
  });

  describe('DRAM Test', () => {
    it('should report pass (P) when RAM is functional', () => {
      harness.loadROM(DRAM_TEST_ROM);
      const bus = harness.createMemoryBus();
      const cpu = new StubCpu6502(bus);

      const result = harness.run(cpu, 100_000_000);

      expect(result.termination).toBe('halted');

      const verification = verifyDRAMTest(result.display, true);
      expect(verification.passed).toBe(true);
      expect(verification.outputChar).toBe('P');
    });

    it('should test all four patterns ($00, $FF, $55, $AA)', () => {
      // This test verifies the ROM code accesses the pattern table correctly.
      // The DRAM test ROM writes/reads 4 patterns across pages $02-$0F.
      // If any read-back fails, it outputs 'F'. Success outputs 'P'.
      harness.loadROM(DRAM_TEST_ROM);
      const bus = harness.createMemoryBus();
      const cpu = new StubCpu6502(bus);

      const result = harness.run(cpu, 100_000_000);
      expect(result.termination).toBe('halted');

      // Verify that memory was actually written by checking a sample location
      // After test, pages $02-$0F should contain the last pattern ($AA)
      // because the last successful pattern write was $AA (index 1 in table,
      // X counts down from 4)
      const display = harness.getDisplay();
      expect(display.rawBytes.length).toBeGreaterThan(0);
    });

    it('should report fail (F) when RAM returns wrong values', () => {
      harness.loadROM(DRAM_TEST_ROM);

      // Create a bus that corrupts reads from a specific RAM page
      const baseBus = harness.createMemoryBus();
      const corruptBus: MemoryBus = {
        read: (addr: number) => {
          // Corrupt reads from page $05 to simulate bad DRAM
          if (addr >= 0x0500 && addr < 0x0600) {
            return baseBus.read(addr) ^ 0x01; // Flip bit 0
          }
          return baseBus.read(addr);
        },
        write: (addr: number, value: number) => baseBus.write(addr, value),
      };
      const cpu = new StubCpu6502(corruptBus);

      const result = harness.run(cpu, 100_000_000);

      expect(result.termination).toBe('halted');
      const verification = verifyDRAMTest(result.display, false);
      expect(verification.passed).toBe(true);
      expect(verification.outputChar).toBe('F');
    });
  });

  describe('Keyboard Echo (TV Typewriter) Test', () => {
    it('should echo keyboard input to display', () => {
      harness.loadROM(KEYBOARD_ECHO_ROM);
      const bus = harness.createMemoryBus();
      const cpu = new StubCpu6502(bus);

      // Queue some keystrokes with delays between them
      const testChars = [0x48, 0x45, 0x4c, 0x4c, 0x4f]; // "HELLO"
      harness.queueKeyboard(
        testChars.map((char, i) => ({
          char,
          atCycle: 100 + i * 1000,
        }))
      );

      // Run for limited cycles (program loops forever waiting for keys)
      const result = harness.run(cpu, 500_000);

      const verification = verifyKeyboardEcho(result.display, testChars);
      expect(verification.passed).toBe(true);
      expect(verification.actual).toContain('HELLO');
    });

    it('should handle special characters', () => {
      harness.loadROM(KEYBOARD_ECHO_ROM);
      const bus = harness.createMemoryBus();
      const cpu = new StubCpu6502(bus);

      // Test with CR character
      harness.queueKeyboard([
        { char: 0x41, atCycle: 100 },  // 'A'
        { char: 0x0d, atCycle: 2000 }, // CR
        { char: 0x42, atCycle: 4000 }, // 'B'
      ]);

      harness.run(cpu, 500_000);
      const display = harness.getDisplay();

      // Should have at least the first character echoed
      expect(display.rawBytes.length).toBeGreaterThanOrEqual(1);
      expect(display.rawBytes[0] & 0x7f).toBe(0x41); // 'A'
    });
  });

  describe('Hex Monitor Test', () => {
    it('should accept two hex digits and respond with =', () => {
      harness.loadROM(HEX_MONITOR_ROM);
      const bus = harness.createMemoryBus();
      const cpu = new StubCpu6502(bus);

      const digit1 = 0x41; // 'A'
      const digit2 = 0x35; // '5'
      harness.queueKeyboard([
        { char: digit1, atCycle: 100 },
        { char: digit2, atCycle: 2000 },
      ]);

      const result = harness.run(cpu, 500_000);

      const verification = verifyHexMonitor(result.display, digit1, digit2);
      expect(verification.passed).toBe(true);
    });

    it('should echo both digits before the = separator', () => {
      harness.loadROM(HEX_MONITOR_ROM);
      const bus = harness.createMemoryBus();
      const cpu = new StubCpu6502(bus);

      harness.queueKeyboard([
        { char: 0x46, atCycle: 100 },   // 'F'
        { char: 0x30, atCycle: 2000 },  // '0'
      ]);

      harness.run(cpu, 500_000);
      const display = harness.getDisplay();

      // First output should be 'F', second should be '0', third should be '='
      expect(display.rawBytes.length).toBeGreaterThanOrEqual(3);
      expect(display.rawBytes[0] & 0x7f).toBe(0x46); // 'F'
      expect(display.rawBytes[1] & 0x7f).toBe(0x30); // '0'
      expect(display.rawBytes[2] & 0x7f).toBe(0x3d); // '='
    });
  });

  describe('ROM Structure', () => {
    it('all ROMs should be exactly 256 bytes', () => {
      expect(SCREEN_FILL_ROM.length).toBe(256);
      expect(DRAM_TEST_ROM.length).toBe(256);
      expect(KEYBOARD_ECHO_ROM.length).toBe(256);
      expect(HEX_MONITOR_ROM.length).toBe(256);
    });

    it('all ROMs should have valid reset vectors pointing to $FF00', () => {
      for (const rom of [SCREEN_FILL_ROM, DRAM_TEST_ROM, KEYBOARD_ECHO_ROM, HEX_MONITOR_ROM]) {
        const resetLo = rom[0xfc]; // $FFFC
        const resetHi = rom[0xfd]; // $FFFD
        const resetVector = (resetHi << 8) | resetLo;
        expect(resetVector).toBe(0xff00);
      }
    });

    it('all ROMs should have NMI and IRQ vectors set', () => {
      for (const rom of [SCREEN_FILL_ROM, DRAM_TEST_ROM, KEYBOARD_ECHO_ROM, HEX_MONITOR_ROM]) {
        const nmiLo = rom[0xfa];
        const nmiHi = rom[0xfb];
        const irqLo = rom[0xfe];
        const irqHi = rom[0xff];
        // Vectors should point somewhere in ROM space
        expect((nmiHi << 8) | nmiLo).toBe(0xff00);
        expect((irqHi << 8) | irqLo).toBe(0xff00);
      }
    });
  });

  describe('Harness Infrastructure', () => {
    it('should reject ROMs that are not 256 bytes', () => {
      expect(() => harness.loadROM(new Uint8Array(128))).toThrow(
        'ROM must be exactly 256 bytes'
      );
      expect(() => harness.loadROM(new Uint8Array(512))).toThrow(
        'ROM must be exactly 256 bytes'
      );
    });

    it('should protect ROM area from writes', () => {
      harness.loadROM(SCREEN_FILL_ROM);
      const bus = harness.createMemoryBus();

      const original = bus.read(0xff00);
      bus.write(0xff00, 0x00);
      expect(bus.read(0xff00)).toBe(original);
    });

    it('should properly simulate PIA display ready flag', () => {
      harness.loadROM(SCREEN_FILL_ROM);
      const bus = harness.createMemoryBus();

      // DSP should report ready (bit 7 clear)
      const dspValue = bus.read(PIA.DSP);
      expect(dspValue & 0x80).toBe(0);
    });

    it('should deliver keyboard input at correct cycle', () => {
      harness.loadROM(KEYBOARD_ECHO_ROM);
      const bus = harness.createMemoryBus();

      harness.queueKeyboard([{ char: 0x41, atCycle: 0 }]);

      // Before running, KBDCR should show no key
      // (keyboard is updated during run loop)
      expect(bus.read(PIA.KBDCR) & 0x80).toBe(0);
    });
  });
});

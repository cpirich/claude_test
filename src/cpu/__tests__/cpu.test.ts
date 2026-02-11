import { describe, it, expect, beforeEach } from 'vitest';
import { Cpu6502 } from '../cpu';
import { Memory, FLAG_C, FLAG_Z, FLAG_I, FLAG_D, FLAG_B, FLAG_U, FLAG_V, FLAG_N } from '../types';

class TestMemory implements Memory {
  private data = new Uint8Array(65536);

  read(address: number): number {
    return this.data[address & 0xFFFF];
  }

  write(address: number, value: number): void {
    this.data[address & 0xFFFF] = value & 0xFF;
  }

  load(address: number, bytes: number[]): void {
    for (let i = 0; i < bytes.length; i++) {
      this.data[(address + i) & 0xFFFF] = bytes[i];
    }
  }
}

describe('Cpu6502', () => {
  let mem: TestMemory;
  let cpu: Cpu6502;

  beforeEach(() => {
    mem = new TestMemory();
    cpu = new Cpu6502(mem);
    // Set reset vector to $0200
    mem.load(0xFFFC, [0x00, 0x02]);
    cpu.reset();
  });

  describe('initialization', () => {
    it('should set PC from reset vector', () => {
      expect(cpu.pc).toBe(0x0200);
    });

    it('should initialize SP to $FD', () => {
      expect(cpu.sp).toBe(0xFD);
    });

    it('should set interrupt disable and unused flags', () => {
      expect(cpu.status & FLAG_I).toBeTruthy();
      expect(cpu.status & FLAG_U).toBeTruthy();
    });
  });

  describe('LDA', () => {
    it('immediate', () => {
      mem.load(0x0200, [0xA9, 0x42]); // LDA #$42
      cpu.step();
      expect(cpu.a).toBe(0x42);
      expect(cpu.pc).toBe(0x0202);
    });

    it('sets zero flag', () => {
      mem.load(0x0200, [0xA9, 0x00]); // LDA #$00
      cpu.step();
      expect(cpu.a).toBe(0x00);
      expect(cpu.getFlag(FLAG_Z)).toBe(true);
      expect(cpu.getFlag(FLAG_N)).toBe(false);
    });

    it('sets negative flag', () => {
      mem.load(0x0200, [0xA9, 0x80]); // LDA #$80
      cpu.step();
      expect(cpu.getFlag(FLAG_N)).toBe(true);
      expect(cpu.getFlag(FLAG_Z)).toBe(false);
    });

    it('zero page', () => {
      mem.write(0x10, 0x55);
      mem.load(0x0200, [0xA5, 0x10]); // LDA $10
      cpu.step();
      expect(cpu.a).toBe(0x55);
    });

    it('zero page X', () => {
      cpu.x = 0x05;
      mem.write(0x15, 0xAA);
      mem.load(0x0200, [0xB5, 0x10]); // LDA $10,X
      cpu.step();
      expect(cpu.a).toBe(0xAA);
    });

    it('zero page X wraps', () => {
      cpu.x = 0xFF;
      mem.write(0x0F, 0x77);
      mem.load(0x0200, [0xB5, 0x10]); // LDA $10,X -> wraps to $0F
      cpu.step();
      expect(cpu.a).toBe(0x77);
    });

    it('absolute', () => {
      mem.write(0x1234, 0xBB);
      mem.load(0x0200, [0xAD, 0x34, 0x12]); // LDA $1234
      cpu.step();
      expect(cpu.a).toBe(0xBB);
    });

    it('absolute X', () => {
      cpu.x = 0x02;
      mem.write(0x1236, 0xCC);
      mem.load(0x0200, [0xBD, 0x34, 0x12]); // LDA $1234,X
      cpu.step();
      expect(cpu.a).toBe(0xCC);
    });

    it('absolute Y', () => {
      cpu.y = 0x03;
      mem.write(0x1237, 0xDD);
      mem.load(0x0200, [0xB9, 0x34, 0x12]); // LDA $1234,Y
      cpu.step();
      expect(cpu.a).toBe(0xDD);
    });

    it('indexed indirect X', () => {
      cpu.x = 0x04;
      mem.load(0x24, [0x00, 0x10]); // pointer at $24 -> $1000
      mem.write(0x1000, 0xEE);
      mem.load(0x0200, [0xA1, 0x20]); // LDA ($20,X)
      cpu.step();
      expect(cpu.a).toBe(0xEE);
    });

    it('indirect indexed Y', () => {
      cpu.y = 0x05;
      mem.load(0x30, [0x00, 0x10]); // pointer at $30 -> $1000
      mem.write(0x1005, 0xFF);
      mem.load(0x0200, [0xB1, 0x30]); // LDA ($30),Y
      cpu.step();
      expect(cpu.a).toBe(0xFF);
    });
  });

  describe('LDX', () => {
    it('immediate', () => {
      mem.load(0x0200, [0xA2, 0x33]);
      cpu.step();
      expect(cpu.x).toBe(0x33);
    });

    it('zero page Y', () => {
      cpu.y = 0x02;
      mem.write(0x12, 0x44);
      mem.load(0x0200, [0xB6, 0x10]); // LDX $10,Y
      cpu.step();
      expect(cpu.x).toBe(0x44);
    });
  });

  describe('LDY', () => {
    it('immediate', () => {
      mem.load(0x0200, [0xA0, 0x55]);
      cpu.step();
      expect(cpu.y).toBe(0x55);
    });
  });

  describe('STA/STX/STY', () => {
    it('STA zero page', () => {
      cpu.a = 0x42;
      mem.load(0x0200, [0x85, 0x10]); // STA $10
      cpu.step();
      expect(mem.read(0x10)).toBe(0x42);
    });

    it('STX zero page', () => {
      cpu.x = 0x43;
      mem.load(0x0200, [0x86, 0x10]); // STX $10
      cpu.step();
      expect(mem.read(0x10)).toBe(0x43);
    });

    it('STY zero page', () => {
      cpu.y = 0x44;
      mem.load(0x0200, [0x84, 0x10]); // STY $10
      cpu.step();
      expect(mem.read(0x10)).toBe(0x44);
    });

    it('STA absolute', () => {
      cpu.a = 0xBB;
      mem.load(0x0200, [0x8D, 0x34, 0x12]); // STA $1234
      cpu.step();
      expect(mem.read(0x1234)).toBe(0xBB);
    });
  });

  describe('transfers', () => {
    it('TAX', () => {
      cpu.a = 0x42;
      mem.load(0x0200, [0xAA]); // TAX
      cpu.step();
      expect(cpu.x).toBe(0x42);
    });

    it('TAY', () => {
      cpu.a = 0x43;
      mem.load(0x0200, [0xA8]); // TAY
      cpu.step();
      expect(cpu.y).toBe(0x43);
    });

    it('TXA', () => {
      cpu.x = 0x44;
      mem.load(0x0200, [0x8A]); // TXA
      cpu.step();
      expect(cpu.a).toBe(0x44);
    });

    it('TYA', () => {
      cpu.y = 0x45;
      mem.load(0x0200, [0x98]); // TYA
      cpu.step();
      expect(cpu.a).toBe(0x45);
    });

    it('TSX', () => {
      cpu.sp = 0xAB;
      mem.load(0x0200, [0xBA]); // TSX
      cpu.step();
      expect(cpu.x).toBe(0xAB);
    });

    it('TXS', () => {
      cpu.x = 0xCD;
      mem.load(0x0200, [0x9A]); // TXS
      cpu.step();
      expect(cpu.sp).toBe(0xCD);
    });
  });

  describe('stack operations', () => {
    it('PHA/PLA', () => {
      cpu.a = 0x42;
      mem.load(0x0200, [0x48, 0xA9, 0x00, 0x68]); // PHA, LDA #$00, PLA
      cpu.step(); // PHA
      cpu.step(); // LDA #$00
      expect(cpu.a).toBe(0x00);
      cpu.step(); // PLA
      expect(cpu.a).toBe(0x42);
    });

    it('PHP/PLP', () => {
      cpu.setFlag(FLAG_C, true);
      cpu.setFlag(FLAG_Z, true);
      mem.load(0x0200, [0x08, 0x18, 0x28]); // PHP, CLC, PLP
      cpu.step(); // PHP
      cpu.step(); // CLC
      expect(cpu.getFlag(FLAG_C)).toBe(false);
      cpu.step(); // PLP
      expect(cpu.getFlag(FLAG_C)).toBe(true);
      expect(cpu.getFlag(FLAG_Z)).toBe(true);
    });

    it('PHP sets B and U flags in pushed value', () => {
      cpu.status = 0x00;
      mem.load(0x0200, [0x08]); // PHP
      cpu.step();
      const pushed = mem.read(0x01FD); // SP was $FD, pushed at $01FD
      expect(pushed & FLAG_B).toBeTruthy();
      expect(pushed & FLAG_U).toBeTruthy();
    });
  });

  describe('ADC (binary)', () => {
    beforeEach(() => {
      cpu.setFlag(FLAG_D, false);
    });

    it('basic addition', () => {
      cpu.a = 0x10;
      cpu.setFlag(FLAG_C, false);
      mem.load(0x0200, [0x69, 0x20]); // ADC #$20
      cpu.step();
      expect(cpu.a).toBe(0x30);
      expect(cpu.getFlag(FLAG_C)).toBe(false);
    });

    it('addition with carry in', () => {
      cpu.a = 0x10;
      cpu.setFlag(FLAG_C, true);
      mem.load(0x0200, [0x69, 0x20]); // ADC #$20
      cpu.step();
      expect(cpu.a).toBe(0x31);
    });

    it('sets carry on overflow', () => {
      cpu.a = 0xFF;
      cpu.setFlag(FLAG_C, false);
      mem.load(0x0200, [0x69, 0x01]); // ADC #$01
      cpu.step();
      expect(cpu.a).toBe(0x00);
      expect(cpu.getFlag(FLAG_C)).toBe(true);
      expect(cpu.getFlag(FLAG_Z)).toBe(true);
    });

    it('sets overflow flag for signed overflow', () => {
      cpu.a = 0x7F; // 127
      cpu.setFlag(FLAG_C, false);
      mem.load(0x0200, [0x69, 0x01]); // ADC #$01
      cpu.step();
      expect(cpu.a).toBe(0x80); // -128
      expect(cpu.getFlag(FLAG_V)).toBe(true);
      expect(cpu.getFlag(FLAG_N)).toBe(true);
    });

    it('no overflow for unsigned-only overflow', () => {
      cpu.a = 0x80; // -128
      cpu.setFlag(FLAG_C, false);
      mem.load(0x0200, [0x69, 0x80]); // ADC #$80 (-128)
      cpu.step();
      expect(cpu.a).toBe(0x00);
      expect(cpu.getFlag(FLAG_V)).toBe(true);
      expect(cpu.getFlag(FLAG_C)).toBe(true);
    });
  });

  describe('SBC (binary)', () => {
    beforeEach(() => {
      cpu.setFlag(FLAG_D, false);
    });

    it('basic subtraction', () => {
      cpu.a = 0x30;
      cpu.setFlag(FLAG_C, true); // no borrow
      mem.load(0x0200, [0xE9, 0x10]); // SBC #$10
      cpu.step();
      expect(cpu.a).toBe(0x20);
      expect(cpu.getFlag(FLAG_C)).toBe(true);
    });

    it('subtraction with borrow', () => {
      cpu.a = 0x30;
      cpu.setFlag(FLAG_C, false); // borrow
      mem.load(0x0200, [0xE9, 0x10]); // SBC #$10
      cpu.step();
      expect(cpu.a).toBe(0x1F);
    });

    it('sets carry=0 on underflow', () => {
      cpu.a = 0x00;
      cpu.setFlag(FLAG_C, true);
      mem.load(0x0200, [0xE9, 0x01]); // SBC #$01
      cpu.step();
      expect(cpu.a).toBe(0xFF);
      expect(cpu.getFlag(FLAG_C)).toBe(false);
      expect(cpu.getFlag(FLAG_N)).toBe(true);
    });

    it('sets overflow flag', () => {
      cpu.a = 0x80; // -128
      cpu.setFlag(FLAG_C, true);
      mem.load(0x0200, [0xE9, 0x01]); // SBC #$01
      cpu.step();
      expect(cpu.a).toBe(0x7F); // 127
      expect(cpu.getFlag(FLAG_V)).toBe(true);
    });
  });

  describe('ADC/SBC BCD mode', () => {
    beforeEach(() => {
      cpu.setFlag(FLAG_D, true);
    });

    it('BCD addition: 15 + 26 = 41', () => {
      cpu.a = 0x15;
      cpu.setFlag(FLAG_C, false);
      mem.load(0x0200, [0x69, 0x26]); // ADC #$26
      cpu.step();
      expect(cpu.a).toBe(0x41);
      expect(cpu.getFlag(FLAG_C)).toBe(false);
    });

    it('BCD addition with carry: 99 + 01 = 00 with carry', () => {
      cpu.a = 0x99;
      cpu.setFlag(FLAG_C, false);
      mem.load(0x0200, [0x69, 0x01]); // ADC #$01
      cpu.step();
      expect(cpu.a).toBe(0x00);
      expect(cpu.getFlag(FLAG_C)).toBe(true);
    });

    it('BCD subtraction: 41 - 26 = 15', () => {
      cpu.a = 0x41;
      cpu.setFlag(FLAG_C, true);
      mem.load(0x0200, [0xE9, 0x26]); // SBC #$26
      cpu.step();
      expect(cpu.a).toBe(0x15);
      expect(cpu.getFlag(FLAG_C)).toBe(true);
    });
  });

  describe('CMP/CPX/CPY', () => {
    it('CMP equal', () => {
      cpu.a = 0x42;
      mem.load(0x0200, [0xC9, 0x42]); // CMP #$42
      cpu.step();
      expect(cpu.getFlag(FLAG_Z)).toBe(true);
      expect(cpu.getFlag(FLAG_C)).toBe(true);
      expect(cpu.getFlag(FLAG_N)).toBe(false);
    });

    it('CMP greater', () => {
      cpu.a = 0x50;
      mem.load(0x0200, [0xC9, 0x42]);
      cpu.step();
      expect(cpu.getFlag(FLAG_Z)).toBe(false);
      expect(cpu.getFlag(FLAG_C)).toBe(true);
    });

    it('CMP less', () => {
      cpu.a = 0x30;
      mem.load(0x0200, [0xC9, 0x42]);
      cpu.step();
      expect(cpu.getFlag(FLAG_Z)).toBe(false);
      expect(cpu.getFlag(FLAG_C)).toBe(false);
    });

    it('CPX', () => {
      cpu.x = 0x42;
      mem.load(0x0200, [0xE0, 0x42]); // CPX #$42
      cpu.step();
      expect(cpu.getFlag(FLAG_Z)).toBe(true);
      expect(cpu.getFlag(FLAG_C)).toBe(true);
    });

    it('CPY', () => {
      cpu.y = 0x42;
      mem.load(0x0200, [0xC0, 0x42]); // CPY #$42
      cpu.step();
      expect(cpu.getFlag(FLAG_Z)).toBe(true);
      expect(cpu.getFlag(FLAG_C)).toBe(true);
    });
  });

  describe('INC/DEC', () => {
    it('INC zero page', () => {
      mem.write(0x10, 0x42);
      mem.load(0x0200, [0xE6, 0x10]); // INC $10
      cpu.step();
      expect(mem.read(0x10)).toBe(0x43);
    });

    it('INC wraps to zero', () => {
      mem.write(0x10, 0xFF);
      mem.load(0x0200, [0xE6, 0x10]);
      cpu.step();
      expect(mem.read(0x10)).toBe(0x00);
      expect(cpu.getFlag(FLAG_Z)).toBe(true);
    });

    it('DEC zero page', () => {
      mem.write(0x10, 0x42);
      mem.load(0x0200, [0xC6, 0x10]); // DEC $10
      cpu.step();
      expect(mem.read(0x10)).toBe(0x41);
    });

    it('INX', () => {
      cpu.x = 0x09;
      mem.load(0x0200, [0xE8]); // INX
      cpu.step();
      expect(cpu.x).toBe(0x0A);
    });

    it('INY', () => {
      cpu.y = 0x09;
      mem.load(0x0200, [0xC8]); // INY
      cpu.step();
      expect(cpu.y).toBe(0x0A);
    });

    it('DEX', () => {
      cpu.x = 0x0A;
      mem.load(0x0200, [0xCA]); // DEX
      cpu.step();
      expect(cpu.x).toBe(0x09);
    });

    it('DEY', () => {
      cpu.y = 0x0A;
      mem.load(0x0200, [0x88]); // DEY
      cpu.step();
      expect(cpu.y).toBe(0x09);
    });
  });

  describe('logical operations', () => {
    it('AND', () => {
      cpu.a = 0xFF;
      mem.load(0x0200, [0x29, 0x0F]); // AND #$0F
      cpu.step();
      expect(cpu.a).toBe(0x0F);
    });

    it('ORA', () => {
      cpu.a = 0xF0;
      mem.load(0x0200, [0x09, 0x0F]); // ORA #$0F
      cpu.step();
      expect(cpu.a).toBe(0xFF);
    });

    it('EOR', () => {
      cpu.a = 0xFF;
      mem.load(0x0200, [0x49, 0x0F]); // EOR #$0F
      cpu.step();
      expect(cpu.a).toBe(0xF0);
    });

    it('BIT sets Z from A AND M', () => {
      cpu.a = 0x0F;
      mem.write(0x10, 0xF0);
      mem.load(0x0200, [0x24, 0x10]); // BIT $10
      cpu.step();
      expect(cpu.getFlag(FLAG_Z)).toBe(true);
    });

    it('BIT sets N and V from memory bits 7 and 6', () => {
      cpu.a = 0xFF;
      mem.write(0x10, 0xC0);
      mem.load(0x0200, [0x24, 0x10]); // BIT $10
      cpu.step();
      expect(cpu.getFlag(FLAG_N)).toBe(true);
      expect(cpu.getFlag(FLAG_V)).toBe(true);
    });
  });

  describe('shifts and rotates', () => {
    it('ASL accumulator', () => {
      cpu.a = 0x81;
      mem.load(0x0200, [0x0A]); // ASL A
      cpu.step();
      expect(cpu.a).toBe(0x02);
      expect(cpu.getFlag(FLAG_C)).toBe(true);
    });

    it('ASL memory', () => {
      mem.write(0x10, 0x40);
      mem.load(0x0200, [0x06, 0x10]); // ASL $10
      cpu.step();
      expect(mem.read(0x10)).toBe(0x80);
      expect(cpu.getFlag(FLAG_C)).toBe(false);
      expect(cpu.getFlag(FLAG_N)).toBe(true);
    });

    it('LSR accumulator', () => {
      cpu.a = 0x03;
      mem.load(0x0200, [0x4A]); // LSR A
      cpu.step();
      expect(cpu.a).toBe(0x01);
      expect(cpu.getFlag(FLAG_C)).toBe(true);
    });

    it('ROL accumulator', () => {
      cpu.a = 0x80;
      cpu.setFlag(FLAG_C, true);
      mem.load(0x0200, [0x2A]); // ROL A
      cpu.step();
      expect(cpu.a).toBe(0x01);
      expect(cpu.getFlag(FLAG_C)).toBe(true);
    });

    it('ROR accumulator', () => {
      cpu.a = 0x01;
      cpu.setFlag(FLAG_C, true);
      mem.load(0x0200, [0x6A]); // ROR A
      cpu.step();
      expect(cpu.a).toBe(0x80);
      expect(cpu.getFlag(FLAG_C)).toBe(true);
    });
  });

  describe('branches', () => {
    it('BEQ taken', () => {
      cpu.setFlag(FLAG_Z, true);
      mem.load(0x0200, [0xF0, 0x05]); // BEQ +5
      cpu.step();
      expect(cpu.pc).toBe(0x0207);
    });

    it('BEQ not taken', () => {
      cpu.setFlag(FLAG_Z, false);
      mem.load(0x0200, [0xF0, 0x05]); // BEQ +5
      cpu.step();
      expect(cpu.pc).toBe(0x0202);
    });

    it('BNE taken', () => {
      cpu.setFlag(FLAG_Z, false);
      mem.load(0x0200, [0xD0, 0x05]); // BNE +5
      cpu.step();
      expect(cpu.pc).toBe(0x0207);
    });

    it('BCC taken', () => {
      cpu.setFlag(FLAG_C, false);
      mem.load(0x0200, [0x90, 0x05]); // BCC +5
      cpu.step();
      expect(cpu.pc).toBe(0x0207);
    });

    it('BCS taken', () => {
      cpu.setFlag(FLAG_C, true);
      mem.load(0x0200, [0xB0, 0x05]); // BCS +5
      cpu.step();
      expect(cpu.pc).toBe(0x0207);
    });

    it('BMI taken', () => {
      cpu.setFlag(FLAG_N, true);
      mem.load(0x0200, [0x30, 0x05]); // BMI +5
      cpu.step();
      expect(cpu.pc).toBe(0x0207);
    });

    it('BPL taken', () => {
      cpu.setFlag(FLAG_N, false);
      mem.load(0x0200, [0x10, 0x05]); // BPL +5
      cpu.step();
      expect(cpu.pc).toBe(0x0207);
    });

    it('backward branch', () => {
      cpu.setFlag(FLAG_Z, true);
      mem.load(0x0200, [0xF0, 0xFC]); // BEQ -4
      cpu.step();
      expect(cpu.pc).toBe(0x01FE);
    });
  });

  describe('jumps and calls', () => {
    it('JMP absolute', () => {
      mem.load(0x0200, [0x4C, 0x00, 0x10]); // JMP $1000
      cpu.step();
      expect(cpu.pc).toBe(0x1000);
    });

    it('JMP indirect', () => {
      mem.load(0x1000, [0x00, 0x20]); // pointer -> $2000
      mem.load(0x0200, [0x6C, 0x00, 0x10]); // JMP ($1000)
      cpu.step();
      expect(cpu.pc).toBe(0x2000);
    });

    it('JMP indirect page boundary bug', () => {
      mem.write(0x10FF, 0x00);
      mem.write(0x1000, 0x20); // wraps to $1000, not $1100
      mem.load(0x0200, [0x6C, 0xFF, 0x10]); // JMP ($10FF)
      cpu.step();
      expect(cpu.pc).toBe(0x2000);
    });

    it('JSR/RTS', () => {
      mem.load(0x0200, [0x20, 0x00, 0x10]); // JSR $1000
      mem.load(0x1000, [0xA9, 0x42, 0x60]); // LDA #$42, RTS
      cpu.step(); // JSR
      expect(cpu.pc).toBe(0x1000);
      cpu.step(); // LDA
      cpu.step(); // RTS
      expect(cpu.pc).toBe(0x0203);
      expect(cpu.a).toBe(0x42);
    });
  });

  describe('flag instructions', () => {
    it('CLC/SEC', () => {
      mem.load(0x0200, [0x38, 0x18]); // SEC, CLC
      cpu.step();
      expect(cpu.getFlag(FLAG_C)).toBe(true);
      cpu.step();
      expect(cpu.getFlag(FLAG_C)).toBe(false);
    });

    it('CLI/SEI', () => {
      mem.load(0x0200, [0x58, 0x78]); // CLI, SEI
      cpu.step();
      expect(cpu.getFlag(FLAG_I)).toBe(false);
      cpu.step();
      expect(cpu.getFlag(FLAG_I)).toBe(true);
    });

    it('CLD/SED', () => {
      mem.load(0x0200, [0xF8, 0xD8]); // SED, CLD
      cpu.step();
      expect(cpu.getFlag(FLAG_D)).toBe(true);
      cpu.step();
      expect(cpu.getFlag(FLAG_D)).toBe(false);
    });

    it('CLV', () => {
      cpu.setFlag(FLAG_V, true);
      mem.load(0x0200, [0xB8]); // CLV
      cpu.step();
      expect(cpu.getFlag(FLAG_V)).toBe(false);
    });
  });

  describe('BRK', () => {
    it('pushes PC+2 and status, jumps to IRQ vector', () => {
      mem.load(0xFFFE, [0x00, 0x30]); // IRQ vector -> $3000
      mem.load(0x0200, [0x00, 0xEA]); // BRK, (padding byte)
      const spBefore = cpu.sp;
      cpu.step();
      expect(cpu.pc).toBe(0x3000);
      expect(cpu.getFlag(FLAG_I)).toBe(true);
      // Should have pushed 3 bytes (PC high, PC low, status)
      expect(cpu.sp).toBe((spBefore - 3) & 0xFF);
    });
  });

  describe('RTI', () => {
    it('restores status and PC', () => {
      // Set up: push PC=$1234 and status with C+Z flags
      cpu.pushWord(0x1234);
      cpu.pushByte(FLAG_C | FLAG_Z | FLAG_U);
      mem.load(cpu.pc, [0x40]); // RTI
      cpu.step();
      expect(cpu.pc).toBe(0x1234);
      expect(cpu.getFlag(FLAG_C)).toBe(true);
      expect(cpu.getFlag(FLAG_Z)).toBe(true);
      expect(cpu.getFlag(FLAG_U)).toBe(true);
      expect(cpu.getFlag(FLAG_B)).toBe(false);
    });
  });

  describe('NOP', () => {
    it('does nothing, advances PC', () => {
      mem.load(0x0200, [0xEA]); // NOP
      const pcBefore = cpu.pc;
      cpu.step();
      expect(cpu.pc).toBe(pcBefore + 1);
    });
  });

  describe('cycle counting', () => {
    it('LDA immediate = 2 cycles', () => {
      mem.load(0x0200, [0xA9, 0x42]);
      const cycles = cpu.step();
      expect(cycles).toBe(2);
    });

    it('LDA absolute = 4 cycles', () => {
      mem.load(0x0200, [0xAD, 0x00, 0x10]);
      const cycles = cpu.step();
      expect(cycles).toBe(4);
    });

    it('LDA absolute,X with page cross = 5 cycles', () => {
      cpu.x = 0xFF;
      mem.load(0x0200, [0xBD, 0x01, 0x10]); // crosses from $10xx to $11xx
      const cycles = cpu.step();
      expect(cycles).toBe(5);
    });

    it('BEQ taken, no page cross = 3 cycles', () => {
      cpu.setFlag(FLAG_Z, true);
      mem.load(0x0200, [0xF0, 0x05]);
      const cycles = cpu.step();
      expect(cycles).toBe(3);
    });

    it('BEQ not taken = 2 cycles', () => {
      cpu.setFlag(FLAG_Z, false);
      mem.load(0x0200, [0xF0, 0x05]);
      const cycles = cpu.step();
      expect(cycles).toBe(2);
    });

    it('JSR = 6 cycles', () => {
      mem.load(0x0200, [0x20, 0x00, 0x10]);
      const cycles = cpu.step();
      expect(cycles).toBe(6);
    });
  });

  describe('integration: small programs', () => {
    it('count from 0 to 5 in X register', () => {
      // LDX #$00; loop: INX; CPX #$05; BNE loop; BRK
      mem.load(0x0200, [
        0xA2, 0x00,       // LDX #$00
        0xE8,             // INX
        0xE0, 0x05,       // CPX #$05
        0xD0, 0xFB,       // BNE -5 (back to INX)
        0x00,             // BRK
      ]);
      mem.load(0xFFFE, [0x10, 0x02]); // IRQ vector -> $0210 (past program)

      // Run enough steps
      for (let i = 0; i < 100; i++) {
        cpu.step();
        if (cpu.pc === 0x0210) break;
      }
      expect(cpu.x).toBe(0x05);
    });

    it('sum memory values', () => {
      // Store values at $0300-$0304
      mem.load(0x0300, [0x01, 0x02, 0x03, 0x04, 0x05]);
      // Program: sum 5 bytes from $0300, store result at $0310
      mem.load(0x0200, [
        0x18,             // CLC
        0xA9, 0x00,       // LDA #$00
        0xA2, 0x00,       // LDX #$00
        // loop:
        0x7D, 0x00, 0x03, // ADC $0300,X
        0xE8,             // INX
        0xE0, 0x05,       // CPX #$05
        0xD0, 0xF8,       // BNE loop
        0x8D, 0x10, 0x03, // STA $0310
      ]);

      for (let i = 0; i < 50; i++) cpu.step();
      expect(mem.read(0x0310)).toBe(15); // 1+2+3+4+5
    });
  });
});

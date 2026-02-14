import { describe, it, expect, beforeEach } from 'vitest';
import { I8080 } from '../i8080';
import type { Memory } from '@/cpu/types';
import type { IOBus } from '@/cpu/z80/types';
import { FLAG_CY, FLAG_P, FLAG_AC, FLAG_Z, FLAG_S, FLAG_ALWAYS_ONE } from '../types';

class TestMemory implements Memory {
  private data = new Uint8Array(65536);

  read(address: number): number {
    return this.data[address & 0xffff];
  }

  write(address: number, value: number): void {
    this.data[address & 0xffff] = value & 0xff;
  }

  load(address: number, bytes: number[]): void {
    for (let i = 0; i < bytes.length; i++) {
      this.data[(address + i) & 0xffff] = bytes[i];
    }
  }
}

class TestIO implements IOBus {
  lastOutPort = -1;
  lastOutValue = -1;
  inValues: Record<number, number> = {};

  in(port: number): number {
    return this.inValues[port] ?? this.inValues[port & 0xff] ?? 0xff;
  }

  out(port: number, value: number): void {
    this.lastOutPort = port;
    this.lastOutValue = value;
  }
}

describe('I8080 CPU', () => {
  let mem: TestMemory;
  let io: TestIO;
  let cpu: I8080;

  beforeEach(() => {
    mem = new TestMemory();
    io = new TestIO();
    cpu = new I8080(mem, io);
    cpu.reset();
  });

  describe('reset', () => {
    it('sets PC to 0', () => {
      expect(cpu.pc).toBe(0);
    });

    it('sets SP to 0', () => {
      expect(cpu.sp).toBe(0);
    });

    it('disables interrupts', () => {
      expect(cpu.interruptsEnabled).toBe(false);
    });

    it('clears all registers', () => {
      expect(cpu.a).toBe(0);
      expect(cpu.b).toBe(0);
      expect(cpu.c).toBe(0);
      expect(cpu.d).toBe(0);
      expect(cpu.e).toBe(0);
      expect(cpu.h).toBe(0);
      expect(cpu.l).toBe(0);
    });

    it('sets flags to 0x02 (bit 1 always set)', () => {
      expect(cpu.f).toBe(FLAG_ALWAYS_ONE);
    });

    it('resets cycle counter', () => {
      expect(cpu.cycles).toBe(0);
    });

    it('clears halted state', () => {
      expect(cpu.halted).toBe(false);
    });
  });

  describe('flag register', () => {
    it('always has bit 1 set', () => {
      cpu.f = 0x00;
      expect(cpu.f & FLAG_ALWAYS_ONE).toBe(FLAG_ALWAYS_ONE);
    });

    it('always has bits 3 and 5 cleared', () => {
      cpu.f = 0xff;
      expect(cpu.f & 0x08).toBe(0); // bit 3
      expect(cpu.f & 0x20).toBe(0); // bit 5
    });

    it('preserves valid flag bits', () => {
      cpu.f = FLAG_S | FLAG_Z | FLAG_AC | FLAG_P | FLAG_CY;
      expect(cpu.f & FLAG_S).toBe(FLAG_S);
      expect(cpu.f & FLAG_Z).toBe(FLAG_Z);
      expect(cpu.f & FLAG_AC).toBe(FLAG_AC);
      expect(cpu.f & FLAG_P).toBe(FLAG_P);
      expect(cpu.f & FLAG_CY).toBe(FLAG_CY);
    });
  });

  describe('register pair accessors', () => {
    it('BC pair', () => {
      cpu.b = 0x12;
      cpu.c = 0x34;
      expect(cpu.bc).toBe(0x1234);
      cpu.bc = 0xABCD;
      expect(cpu.b).toBe(0xAB);
      expect(cpu.c).toBe(0xCD);
    });

    it('DE pair', () => {
      cpu.d = 0x56;
      cpu.e = 0x78;
      expect(cpu.de).toBe(0x5678);
      cpu.de = 0x1234;
      expect(cpu.d).toBe(0x12);
      expect(cpu.e).toBe(0x34);
    });

    it('HL pair', () => {
      cpu.h = 0x9A;
      cpu.l = 0xBC;
      expect(cpu.hl).toBe(0x9ABC);
      cpu.hl = 0x5678;
      expect(cpu.h).toBe(0x56);
      expect(cpu.l).toBe(0x78);
    });

    it('AF pair masks flags properly', () => {
      cpu.af = 0xFFFF;
      expect(cpu.a).toBe(0xFF);
      expect(cpu.f & 0x08).toBe(0); // bit 3 always 0
      expect(cpu.f & 0x20).toBe(0); // bit 5 always 0
      expect(cpu.f & FLAG_ALWAYS_ONE).toBe(FLAG_ALWAYS_ONE);
    });
  });

  describe('NOP', () => {
    it('advances PC and consumes 4 cycles', () => {
      mem.load(0, [0x00]); // NOP
      const c = cpu.step();
      expect(cpu.pc).toBe(1);
      expect(c).toBe(4);
      expect(cpu.cycles).toBe(4);
    });
  });

  describe('8-bit load instructions', () => {
    it('MVI B, d8', () => {
      mem.load(0, [0x06, 0x42]); // MVI B, $42
      cpu.step();
      expect(cpu.b).toBe(0x42);
      expect(cpu.cycles).toBe(7);
    });

    it('MVI A, d8', () => {
      mem.load(0, [0x3e, 0xff]); // MVI A, $FF
      cpu.step();
      expect(cpu.a).toBe(0xff);
    });

    it('MVI M, d8', () => {
      mem.load(0, [0x36, 0x99]); // MVI M, $99
      cpu.hl = 0x2000;
      cpu.step();
      expect(mem.read(0x2000)).toBe(0x99);
      expect(cpu.cycles).toBe(10);
    });

    it('MOV B, C', () => {
      mem.load(0, [0x41]); // MOV B, C
      cpu.c = 0x37;
      cpu.step();
      expect(cpu.b).toBe(0x37);
      expect(cpu.cycles).toBe(5);
    });

    it('MOV A, M (memory)', () => {
      mem.load(0, [0x7e]); // MOV A, M
      cpu.hl = 0x1000;
      mem.write(0x1000, 0xAA);
      cpu.step();
      expect(cpu.a).toBe(0xAA);
      expect(cpu.cycles).toBe(7);
    });

    it('MOV M, A (memory)', () => {
      mem.load(0, [0x77]); // MOV M, A
      cpu.a = 0xBB;
      cpu.hl = 0x1000;
      cpu.step();
      expect(mem.read(0x1000)).toBe(0xBB);
      expect(cpu.cycles).toBe(7);
    });

    it('LDAX B', () => {
      mem.load(0, [0x0a]); // LDAX B
      cpu.bc = 0x2000;
      mem.write(0x2000, 0x55);
      cpu.step();
      expect(cpu.a).toBe(0x55);
    });

    it('LDAX D', () => {
      mem.load(0, [0x1a]); // LDAX D
      cpu.de = 0x3000;
      mem.write(0x3000, 0x66);
      cpu.step();
      expect(cpu.a).toBe(0x66);
    });

    it('STAX B', () => {
      mem.load(0, [0x02]); // STAX B
      cpu.a = 0x77;
      cpu.bc = 0x4000;
      cpu.step();
      expect(mem.read(0x4000)).toBe(0x77);
    });

    it('STAX D', () => {
      mem.load(0, [0x12]); // STAX D
      cpu.a = 0x88;
      cpu.de = 0x5000;
      cpu.step();
      expect(mem.read(0x5000)).toBe(0x88);
    });

    it('LDA addr', () => {
      mem.load(0, [0x3a, 0x00, 0x10]); // LDA $1000
      mem.write(0x1000, 0x99);
      cpu.step();
      expect(cpu.a).toBe(0x99);
      expect(cpu.cycles).toBe(13);
    });

    it('STA addr', () => {
      mem.load(0, [0x32, 0x00, 0x10]); // STA $1000
      cpu.a = 0xAA;
      cpu.step();
      expect(mem.read(0x1000)).toBe(0xAA);
    });

    it('LHLD addr', () => {
      mem.load(0, [0x2a, 0x00, 0x10]); // LHLD $1000
      mem.write(0x1000, 0x34);
      mem.write(0x1001, 0x12);
      cpu.step();
      expect(cpu.hl).toBe(0x1234);
      expect(cpu.cycles).toBe(16);
    });

    it('SHLD addr', () => {
      mem.load(0, [0x22, 0x00, 0x10]); // SHLD $1000
      cpu.hl = 0x5678;
      cpu.step();
      expect(mem.read(0x1000)).toBe(0x78);
      expect(mem.read(0x1001)).toBe(0x56);
    });
  });

  describe('16-bit load instructions', () => {
    it('LXI B, d16', () => {
      mem.load(0, [0x01, 0x34, 0x12]); // LXI B, $1234
      cpu.step();
      expect(cpu.bc).toBe(0x1234);
      expect(cpu.cycles).toBe(10);
    });

    it('LXI D, d16', () => {
      mem.load(0, [0x11, 0x78, 0x56]); // LXI D, $5678
      cpu.step();
      expect(cpu.de).toBe(0x5678);
    });

    it('LXI H, d16', () => {
      mem.load(0, [0x21, 0xBC, 0x9A]); // LXI H, $9ABC
      cpu.step();
      expect(cpu.hl).toBe(0x9ABC);
    });

    it('LXI SP, d16', () => {
      mem.load(0, [0x31, 0xFF, 0xFF]); // LXI SP, $FFFF
      cpu.step();
      expect(cpu.sp).toBe(0xFFFF);
    });
  });

  describe('arithmetic instructions', () => {
    it('ADD B', () => {
      mem.load(0, [0x80]); // ADD B
      cpu.a = 0x10;
      cpu.b = 0x20;
      cpu.step();
      expect(cpu.a).toBe(0x30);
      expect(cpu.f & FLAG_CY).toBe(0);
      expect(cpu.cycles).toBe(4);
    });

    it('ADD M', () => {
      mem.load(0, [0x86]); // ADD M
      cpu.a = 0x10;
      cpu.hl = 0x1000;
      mem.write(0x1000, 0x20);
      cpu.step();
      expect(cpu.a).toBe(0x30);
      expect(cpu.cycles).toBe(7);
    });

    it('ADD with carry', () => {
      mem.load(0, [0x80]); // ADD B
      cpu.a = 0xFF;
      cpu.b = 0x01;
      cpu.step();
      expect(cpu.a).toBe(0x00);
      expect(cpu.f & FLAG_CY).toBe(FLAG_CY);
      expect(cpu.f & FLAG_Z).toBe(FLAG_Z);
    });

    it('ADD sets aux carry', () => {
      mem.load(0, [0x80]); // ADD B
      cpu.a = 0x0F;
      cpu.b = 0x01;
      cpu.step();
      expect(cpu.a).toBe(0x10);
      expect(cpu.f & FLAG_AC).toBe(FLAG_AC);
    });

    it('ADC with carry in', () => {
      mem.load(0, [0x88]); // ADC B
      cpu.a = 0x10;
      cpu.b = 0x20;
      cpu.f = FLAG_CY | FLAG_ALWAYS_ONE;
      cpu.step();
      expect(cpu.a).toBe(0x31);
    });

    it('ADI immediate', () => {
      mem.load(0, [0xc6, 0x42]); // ADI $42
      cpu.a = 0x10;
      cpu.step();
      expect(cpu.a).toBe(0x52);
      expect(cpu.cycles).toBe(7);
    });

    it('ACI immediate with carry', () => {
      mem.load(0, [0xce, 0x10]); // ACI $10
      cpu.a = 0x20;
      cpu.f = FLAG_CY | FLAG_ALWAYS_ONE;
      cpu.step();
      expect(cpu.a).toBe(0x31);
    });

    it('SUB B', () => {
      mem.load(0, [0x90]); // SUB B
      cpu.a = 0x30;
      cpu.b = 0x10;
      cpu.step();
      expect(cpu.a).toBe(0x20);
      expect(cpu.f & FLAG_CY).toBe(0);
    });

    it('SUB with borrow', () => {
      mem.load(0, [0x90]); // SUB B
      cpu.a = 0x10;
      cpu.b = 0x30;
      cpu.step();
      expect(cpu.a).toBe(0xE0);
      expect(cpu.f & FLAG_CY).toBe(FLAG_CY);
    });

    it('SBB with borrow in', () => {
      mem.load(0, [0x98]); // SBB B
      cpu.a = 0x30;
      cpu.b = 0x10;
      cpu.f = FLAG_CY | FLAG_ALWAYS_ONE;
      cpu.step();
      expect(cpu.a).toBe(0x1F);
    });

    it('SUI immediate', () => {
      mem.load(0, [0xd6, 0x05]); // SUI $05
      cpu.a = 0x10;
      cpu.step();
      expect(cpu.a).toBe(0x0B);
    });

    it('INR B', () => {
      mem.load(0, [0x04]); // INR B
      cpu.b = 0x41;
      cpu.step();
      expect(cpu.b).toBe(0x42);
      expect(cpu.cycles).toBe(5);
    });

    it('INR wraps to 0', () => {
      mem.load(0, [0x04]); // INR B
      cpu.b = 0xFF;
      cpu.step();
      expect(cpu.b).toBe(0x00);
      expect(cpu.f & FLAG_Z).toBe(FLAG_Z);
    });

    it('INR does not affect carry', () => {
      mem.load(0, [0x04]); // INR B
      cpu.b = 0xFF;
      cpu.f = FLAG_CY | FLAG_ALWAYS_ONE;
      cpu.step();
      expect(cpu.f & FLAG_CY).toBe(FLAG_CY);
    });

    it('DCR B', () => {
      mem.load(0, [0x05]); // DCR B
      cpu.b = 0x42;
      cpu.step();
      expect(cpu.b).toBe(0x41);
      expect(cpu.cycles).toBe(5);
    });

    it('DCR wraps to FF', () => {
      mem.load(0, [0x05]); // DCR B
      cpu.b = 0x00;
      cpu.step();
      expect(cpu.b).toBe(0xFF);
      expect(cpu.f & FLAG_S).toBe(FLAG_S);
    });

    it('DCR does not affect carry', () => {
      mem.load(0, [0x05]); // DCR B
      cpu.b = 0x00;
      cpu.f = FLAG_CY | FLAG_ALWAYS_ONE;
      cpu.step();
      expect(cpu.f & FLAG_CY).toBe(FLAG_CY);
    });

    it('INX B', () => {
      mem.load(0, [0x03]); // INX B
      cpu.bc = 0x1234;
      cpu.step();
      expect(cpu.bc).toBe(0x1235);
      expect(cpu.cycles).toBe(5);
    });

    it('INX wraps 16-bit', () => {
      mem.load(0, [0x03]); // INX B
      cpu.bc = 0xFFFF;
      cpu.step();
      expect(cpu.bc).toBe(0x0000);
    });

    it('DCX B', () => {
      mem.load(0, [0x0b]); // DCX B
      cpu.bc = 0x1234;
      cpu.step();
      expect(cpu.bc).toBe(0x1233);
      expect(cpu.cycles).toBe(5);
    });

    it('DAD B', () => {
      mem.load(0, [0x09]); // DAD B
      cpu.hl = 0x1000;
      cpu.bc = 0x2000;
      cpu.step();
      expect(cpu.hl).toBe(0x3000);
      expect(cpu.f & FLAG_CY).toBe(0);
      expect(cpu.cycles).toBe(10);
    });

    it('DAD with carry', () => {
      mem.load(0, [0x09]); // DAD B
      cpu.hl = 0xF000;
      cpu.bc = 0x2000;
      cpu.step();
      expect(cpu.hl).toBe(0x1000);
      expect(cpu.f & FLAG_CY).toBe(FLAG_CY);
    });

    it('DAD H (HL += HL)', () => {
      mem.load(0, [0x29]); // DAD H
      cpu.hl = 0x1234;
      cpu.step();
      expect(cpu.hl).toBe(0x2468);
    });
  });

  describe('logical instructions', () => {
    it('ANA B', () => {
      mem.load(0, [0xa0]); // ANA B
      cpu.a = 0xFF;
      cpu.b = 0x0F;
      cpu.step();
      expect(cpu.a).toBe(0x0F);
      expect(cpu.f & FLAG_CY).toBe(0);
      expect(cpu.cycles).toBe(4);
    });

    it('ANI immediate', () => {
      mem.load(0, [0xe6, 0xF0]); // ANI $F0
      cpu.a = 0xAB;
      cpu.step();
      expect(cpu.a).toBe(0xA0);
    });

    it('XRA B', () => {
      mem.load(0, [0xa8]); // XRA B
      cpu.a = 0xFF;
      cpu.b = 0x0F;
      cpu.step();
      expect(cpu.a).toBe(0xF0);
      expect(cpu.f & FLAG_CY).toBe(0);
    });

    it('XRA A clears accumulator', () => {
      mem.load(0, [0xaf]); // XRA A
      cpu.a = 0x42;
      cpu.step();
      expect(cpu.a).toBe(0x00);
      expect(cpu.f & FLAG_Z).toBe(FLAG_Z);
      expect(cpu.f & FLAG_P).toBe(FLAG_P); // 0 has even parity
    });

    it('ORA B', () => {
      mem.load(0, [0xb0]); // ORA B
      cpu.a = 0xF0;
      cpu.b = 0x0F;
      cpu.step();
      expect(cpu.a).toBe(0xFF);
      expect(cpu.f & FLAG_CY).toBe(0);
    });

    it('ORI immediate', () => {
      mem.load(0, [0xf6, 0x0F]); // ORI $0F
      cpu.a = 0xF0;
      cpu.step();
      expect(cpu.a).toBe(0xFF);
    });

    it('CMP B (equal)', () => {
      mem.load(0, [0xb8]); // CMP B
      cpu.a = 0x42;
      cpu.b = 0x42;
      cpu.step();
      expect(cpu.a).toBe(0x42); // A unchanged
      expect(cpu.f & FLAG_Z).toBe(FLAG_Z);
      expect(cpu.f & FLAG_CY).toBe(0);
    });

    it('CMP B (A < B)', () => {
      mem.load(0, [0xb8]); // CMP B
      cpu.a = 0x10;
      cpu.b = 0x20;
      cpu.step();
      expect(cpu.f & FLAG_CY).toBe(FLAG_CY);
    });

    it('CPI immediate', () => {
      mem.load(0, [0xfe, 0x42]); // CPI $42
      cpu.a = 0x42;
      cpu.step();
      expect(cpu.f & FLAG_Z).toBe(FLAG_Z);
    });

    it('CMA', () => {
      mem.load(0, [0x2f]); // CMA
      cpu.a = 0xAA;
      cpu.step();
      expect(cpu.a).toBe(0x55);
    });
  });

  describe('rotate instructions', () => {
    it('RLC', () => {
      mem.load(0, [0x07]); // RLC
      cpu.a = 0x80;
      cpu.step();
      expect(cpu.a).toBe(0x01);
      expect(cpu.f & FLAG_CY).toBe(FLAG_CY);
      expect(cpu.cycles).toBe(4);
    });

    it('RLC no carry', () => {
      mem.load(0, [0x07]); // RLC
      cpu.a = 0x40;
      cpu.step();
      expect(cpu.a).toBe(0x80);
      expect(cpu.f & FLAG_CY).toBe(0);
    });

    it('RRC', () => {
      mem.load(0, [0x0f]); // RRC
      cpu.a = 0x01;
      cpu.step();
      expect(cpu.a).toBe(0x80);
      expect(cpu.f & FLAG_CY).toBe(FLAG_CY);
    });

    it('RAL', () => {
      mem.load(0, [0x17]); // RAL
      cpu.a = 0x80;
      cpu.f = FLAG_ALWAYS_ONE; // carry = 0
      cpu.step();
      expect(cpu.a).toBe(0x00);
      expect(cpu.f & FLAG_CY).toBe(FLAG_CY);
    });

    it('RAL with carry in', () => {
      mem.load(0, [0x17]); // RAL
      cpu.a = 0x00;
      cpu.f = FLAG_CY | FLAG_ALWAYS_ONE;
      cpu.step();
      expect(cpu.a).toBe(0x01);
      expect(cpu.f & FLAG_CY).toBe(0);
    });

    it('RAR', () => {
      mem.load(0, [0x1f]); // RAR
      cpu.a = 0x01;
      cpu.f = FLAG_ALWAYS_ONE; // carry = 0
      cpu.step();
      expect(cpu.a).toBe(0x00);
      expect(cpu.f & FLAG_CY).toBe(FLAG_CY);
    });

    it('RAR with carry in', () => {
      mem.load(0, [0x1f]); // RAR
      cpu.a = 0x00;
      cpu.f = FLAG_CY | FLAG_ALWAYS_ONE;
      cpu.step();
      expect(cpu.a).toBe(0x80);
      expect(cpu.f & FLAG_CY).toBe(0);
    });
  });

  describe('flag instructions', () => {
    it('STC', () => {
      mem.load(0, [0x37]); // STC
      cpu.f = FLAG_ALWAYS_ONE;
      cpu.step();
      expect(cpu.f & FLAG_CY).toBe(FLAG_CY);
    });

    it('CMC', () => {
      mem.load(0, [0x3f]); // CMC
      cpu.f = FLAG_CY | FLAG_ALWAYS_ONE;
      cpu.step();
      expect(cpu.f & FLAG_CY).toBe(0);
    });

    it('CMC sets carry', () => {
      mem.load(0, [0x3f]); // CMC
      cpu.f = FLAG_ALWAYS_ONE;
      cpu.step();
      expect(cpu.f & FLAG_CY).toBe(FLAG_CY);
    });
  });

  describe('jump instructions', () => {
    it('JMP addr', () => {
      mem.load(0, [0xc3, 0x00, 0x10]); // JMP $1000
      cpu.step();
      expect(cpu.pc).toBe(0x1000);
      expect(cpu.cycles).toBe(10);
    });

    it('JZ taken', () => {
      mem.load(0, [0xca, 0x00, 0x20]); // JZ $2000
      cpu.f = FLAG_Z | FLAG_ALWAYS_ONE;
      cpu.step();
      expect(cpu.pc).toBe(0x2000);
    });

    it('JZ not taken', () => {
      mem.load(0, [0xca, 0x00, 0x20]); // JZ $2000
      cpu.f = FLAG_ALWAYS_ONE;
      cpu.step();
      expect(cpu.pc).toBe(3);
    });

    it('JNZ taken', () => {
      mem.load(0, [0xc2, 0x00, 0x30]); // JNZ $3000
      cpu.f = FLAG_ALWAYS_ONE;
      cpu.step();
      expect(cpu.pc).toBe(0x3000);
    });

    it('JC taken', () => {
      mem.load(0, [0xda, 0x00, 0x40]); // JC $4000
      cpu.f = FLAG_CY | FLAG_ALWAYS_ONE;
      cpu.step();
      expect(cpu.pc).toBe(0x4000);
    });

    it('JNC not taken', () => {
      mem.load(0, [0xd2, 0x00, 0x40]); // JNC $4000
      cpu.f = FLAG_CY | FLAG_ALWAYS_ONE;
      cpu.step();
      expect(cpu.pc).toBe(3);
    });

    it('JPE (parity even) taken', () => {
      mem.load(0, [0xea, 0x00, 0x50]); // JPE $5000
      cpu.f = FLAG_P | FLAG_ALWAYS_ONE;
      cpu.step();
      expect(cpu.pc).toBe(0x5000);
    });

    it('JPO (parity odd) taken', () => {
      mem.load(0, [0xe2, 0x00, 0x50]); // JPO $5000
      cpu.f = FLAG_ALWAYS_ONE; // P flag clear = odd parity
      cpu.step();
      expect(cpu.pc).toBe(0x5000);
    });

    it('JP (positive) taken', () => {
      mem.load(0, [0xf2, 0x00, 0x60]); // JP $6000
      cpu.f = FLAG_ALWAYS_ONE; // S flag clear = positive
      cpu.step();
      expect(cpu.pc).toBe(0x6000);
    });

    it('JM (minus) taken', () => {
      mem.load(0, [0xfa, 0x00, 0x60]); // JM $6000
      cpu.f = FLAG_S | FLAG_ALWAYS_ONE;
      cpu.step();
      expect(cpu.pc).toBe(0x6000);
    });

    it('PCHL', () => {
      mem.load(0, [0xe9]); // PCHL
      cpu.hl = 0x4567;
      cpu.step();
      expect(cpu.pc).toBe(0x4567);
      expect(cpu.cycles).toBe(5);
    });
  });

  describe('call and return instructions', () => {
    it('CALL addr', () => {
      mem.load(0, [0xcd, 0x00, 0x10]); // CALL $1000
      cpu.sp = 0xFFFE;
      cpu.step();
      expect(cpu.pc).toBe(0x1000);
      expect(cpu.sp).toBe(0xFFFC);
      expect(mem.read(0xFFFC)).toBe(0x03); // low byte of return addr
      expect(mem.read(0xFFFD)).toBe(0x00); // high byte
      expect(cpu.cycles).toBe(17);
    });

    it('RET', () => {
      mem.load(0x1000, [0xc9]); // RET
      cpu.pc = 0x1000;
      cpu.sp = 0xFFFC;
      mem.write(0xFFFC, 0x03);
      mem.write(0xFFFD, 0x00);
      cpu.step();
      expect(cpu.pc).toBe(0x0003);
      expect(cpu.sp).toBe(0xFFFE);
      expect(cpu.cycles).toBe(10);
    });

    it('conditional CALL taken', () => {
      mem.load(0, [0xcc, 0x00, 0x10]); // CZ $1000
      cpu.sp = 0xFFFE;
      cpu.f = FLAG_Z | FLAG_ALWAYS_ONE;
      cpu.step();
      expect(cpu.pc).toBe(0x1000);
      expect(cpu.cycles).toBe(17); // 11 + 6
    });

    it('conditional CALL not taken', () => {
      mem.load(0, [0xcc, 0x00, 0x10]); // CZ $1000
      cpu.sp = 0xFFFE;
      cpu.f = FLAG_ALWAYS_ONE; // Z flag clear
      cpu.step();
      expect(cpu.pc).toBe(3);
      expect(cpu.sp).toBe(0xFFFE); // SP unchanged
      expect(cpu.cycles).toBe(11);
    });

    it('conditional RET taken', () => {
      mem.load(0x1000, [0xc8]); // RZ
      cpu.pc = 0x1000;
      cpu.sp = 0xFFFC;
      mem.write(0xFFFC, 0x03);
      mem.write(0xFFFD, 0x00);
      cpu.f = FLAG_Z | FLAG_ALWAYS_ONE;
      cpu.step();
      expect(cpu.pc).toBe(0x0003);
      expect(cpu.cycles).toBe(11); // 5 + 6
    });

    it('conditional RET not taken', () => {
      mem.load(0x1000, [0xc8]); // RZ
      cpu.pc = 0x1000;
      cpu.sp = 0xFFFC;
      cpu.f = FLAG_ALWAYS_ONE; // Z flag clear
      cpu.step();
      expect(cpu.pc).toBe(0x1001);
      expect(cpu.sp).toBe(0xFFFC); // SP unchanged
      expect(cpu.cycles).toBe(5);
    });

    it('RST 0', () => {
      mem.load(0x100, [0xc7]); // RST 0
      cpu.pc = 0x100;
      cpu.sp = 0xFFFE;
      cpu.step();
      expect(cpu.pc).toBe(0x0000);
      expect(cpu.sp).toBe(0xFFFC);
    });

    it('RST 7', () => {
      mem.load(0x100, [0xff]); // RST 7
      cpu.pc = 0x100;
      cpu.sp = 0xFFFE;
      cpu.step();
      expect(cpu.pc).toBe(0x0038);
    });

    it('RST 3', () => {
      mem.load(0, [0xdf]); // RST 3
      cpu.sp = 0xFFFE;
      cpu.step();
      expect(cpu.pc).toBe(0x0018);
    });
  });

  describe('stack instructions', () => {
    it('PUSH B', () => {
      mem.load(0, [0xc5]); // PUSH B
      cpu.bc = 0x1234;
      cpu.sp = 0xFFFE;
      cpu.step();
      expect(cpu.sp).toBe(0xFFFC);
      expect(mem.read(0xFFFD)).toBe(0x12);
      expect(mem.read(0xFFFC)).toBe(0x34);
      expect(cpu.cycles).toBe(11);
    });

    it('POP B', () => {
      mem.load(0, [0xc1]); // POP B
      cpu.sp = 0xFFFC;
      mem.write(0xFFFC, 0x34);
      mem.write(0xFFFD, 0x12);
      cpu.step();
      expect(cpu.bc).toBe(0x1234);
      expect(cpu.sp).toBe(0xFFFE);
      expect(cpu.cycles).toBe(10);
    });

    it('PUSH PSW preserves flags', () => {
      mem.load(0, [0xf5]); // PUSH PSW
      cpu.a = 0x42;
      cpu.f = FLAG_S | FLAG_Z | FLAG_CY | FLAG_ALWAYS_ONE;
      cpu.sp = 0xFFFE;
      cpu.step();
      expect(mem.read(0xFFFD)).toBe(0x42); // A
      const pushedFlags = mem.read(0xFFFC);
      expect(pushedFlags & FLAG_S).toBe(FLAG_S);
      expect(pushedFlags & FLAG_Z).toBe(FLAG_Z);
      expect(pushedFlags & FLAG_CY).toBe(FLAG_CY);
      expect(pushedFlags & FLAG_ALWAYS_ONE).toBe(FLAG_ALWAYS_ONE);
    });

    it('POP PSW restores flags with masking', () => {
      mem.load(0, [0xf1]); // POP PSW
      cpu.sp = 0xFFFC;
      mem.write(0xFFFC, 0xFF); // flags byte (all bits set)
      mem.write(0xFFFD, 0x42); // A
      cpu.step();
      expect(cpu.a).toBe(0x42);
      // bits 3 and 5 must be 0, bit 1 must be 1
      expect(cpu.f & 0x08).toBe(0);
      expect(cpu.f & 0x20).toBe(0);
      expect(cpu.f & FLAG_ALWAYS_ONE).toBe(FLAG_ALWAYS_ONE);
    });

    it('XTHL', () => {
      mem.load(0, [0xe3]); // XTHL
      cpu.hl = 0x1234;
      cpu.sp = 0xFFFC;
      mem.write(0xFFFC, 0x78);
      mem.write(0xFFFD, 0x56);
      cpu.step();
      expect(cpu.hl).toBe(0x5678);
      expect(mem.read(0xFFFC)).toBe(0x34);
      expect(mem.read(0xFFFD)).toBe(0x12);
      expect(cpu.cycles).toBe(18);
    });

    it('SPHL', () => {
      mem.load(0, [0xf9]); // SPHL
      cpu.hl = 0x5678;
      cpu.step();
      expect(cpu.sp).toBe(0x5678);
      expect(cpu.cycles).toBe(5);
    });
  });

  describe('exchange instructions', () => {
    it('XCHG', () => {
      mem.load(0, [0xeb]); // XCHG
      cpu.hl = 0x1234;
      cpu.de = 0x5678;
      cpu.step();
      expect(cpu.hl).toBe(0x5678);
      expect(cpu.de).toBe(0x1234);
      expect(cpu.cycles).toBe(4);
    });
  });

  describe('I/O instructions', () => {
    it('OUT port', () => {
      mem.load(0, [0xd3, 0x42]); // OUT $42
      cpu.a = 0xFF;
      cpu.step();
      expect(io.lastOutPort).toBe(0x42);
      expect(io.lastOutValue).toBe(0xFF);
      expect(cpu.cycles).toBe(10);
    });

    it('IN port', () => {
      mem.load(0, [0xdb, 0x42]); // IN $42
      io.inValues[0x42] = 0xAB;
      cpu.step();
      expect(cpu.a).toBe(0xAB);
      expect(cpu.cycles).toBe(10);
    });
  });

  describe('interrupt instructions', () => {
    it('EI enables interrupts', () => {
      mem.load(0, [0xfb]); // EI
      cpu.step();
      expect(cpu.interruptsEnabled).toBe(true);
    });

    it('DI disables interrupts', () => {
      mem.load(0, [0xfb, 0xf3]); // EI, DI
      cpu.step();
      cpu.step();
      expect(cpu.interruptsEnabled).toBe(false);
    });

    it('IRQ with interrupts enabled', () => {
      cpu.sp = 0xFFFE;
      cpu.pc = 0x1234;
      mem.load(0x1234, [0x00]); // NOP (won't execute)
      // Enable interrupts
      cpu.a = 0; // dummy
      mem.load(0, [0xfb]); // EI
      cpu.pc = 0;
      cpu.step(); // Execute EI

      cpu.pc = 0x1234;
      cpu.irq(3); // RST 3
      expect(cpu.pc).toBe(0x0018); // 3 << 3
      expect(cpu.interruptsEnabled).toBe(false);
      expect(cpu.sp).toBe(0xFFFC);
      // Return address pushed
      expect(mem.read(0xFFFC)).toBe(0x34);
      expect(mem.read(0xFFFD)).toBe(0x12);
    });

    it('IRQ with interrupts disabled does nothing', () => {
      cpu.pc = 0x1234;
      cpu.sp = 0xFFFE;
      cpu.irq(3);
      expect(cpu.pc).toBe(0x1234);
      expect(cpu.sp).toBe(0xFFFE);
    });

    it('IRQ unhaults CPU', () => {
      mem.load(0, [0xfb, 0x76]); // EI, HLT
      cpu.sp = 0xFFFE;
      cpu.step(); // EI
      cpu.step(); // HLT
      expect(cpu.halted).toBe(true);
      cpu.irq(0); // RST 0
      expect(cpu.halted).toBe(false);
      expect(cpu.pc).toBe(0x0000);
    });
  });

  describe('HLT', () => {
    it('halts the CPU', () => {
      mem.load(0, [0x76]); // HLT
      cpu.step();
      expect(cpu.halted).toBe(true);
    });

    it('step returns 4 cycles when halted', () => {
      cpu.halted = true;
      const c = cpu.step();
      expect(c).toBe(4);
    });
  });

  describe('DAA', () => {
    it('adjusts BCD result', () => {
      // 0x15 + 0x27 should give BCD 0x42
      mem.load(0, [0x80, 0x27]); // ADD B, DAA
      cpu.a = 0x15;
      cpu.b = 0x27;
      cpu.step(); // ADD B -> A=0x3C
      expect(cpu.a).toBe(0x3C);
      mem.load(1, [0x27]); // DAA
      cpu.step();
      expect(cpu.a).toBe(0x42);
    });

    it('handles carry from DAA', () => {
      mem.load(0, [0x80, 0x27]); // ADD B, DAA
      cpu.a = 0x99;
      cpu.b = 0x01;
      cpu.step(); // ADD B -> A=0x9A
      cpu.step(); // DAA
      expect(cpu.a).toBe(0x00);
      expect(cpu.f & FLAG_CY).toBe(FLAG_CY);
    });
  });

  describe('run method', () => {
    it('runs multiple instructions', () => {
      // MVI A, 5; MVI B, 3; ADD B
      mem.load(0, [0x3e, 0x05, 0x06, 0x03, 0x80]);
      const consumed = cpu.run(20);
      expect(cpu.a).toBe(8);
      expect(consumed).toBeGreaterThanOrEqual(18); // 7+7+4 = 18
    });

    it('stops at halt', () => {
      mem.load(0, [0x3e, 0x42, 0x76]); // MVI A, $42; HLT
      cpu.run(100);
      expect(cpu.a).toBe(0x42);
      expect(cpu.halted).toBe(true);
    });
  });

  describe('parity flag', () => {
    it('set for even parity (0x00)', () => {
      mem.load(0, [0xaf]); // XRA A -> A=0
      cpu.step();
      expect(cpu.f & FLAG_P).toBe(FLAG_P);
    });

    it('cleared for odd parity (0x01)', () => {
      mem.load(0, [0x3e, 0x01, 0xb7]); // MVI A, 1; ORA A
      cpu.step(); // MVI
      cpu.step(); // ORA A
      expect(cpu.f & FLAG_P).toBe(0);
    });

    it('set for even parity (0x03 = 2 bits)', () => {
      mem.load(0, [0x3e, 0x03, 0xb7]); // MVI A, 3; ORA A
      cpu.step(); // MVI
      cpu.step(); // ORA A
      expect(cpu.f & FLAG_P).toBe(FLAG_P);
    });
  });

  describe('sign flag', () => {
    it('set for negative result', () => {
      mem.load(0, [0x3e, 0x80, 0xb7]); // MVI A, $80; ORA A
      cpu.step(); // MVI
      cpu.step(); // ORA A
      expect(cpu.f & FLAG_S).toBe(FLAG_S);
    });

    it('cleared for positive result', () => {
      mem.load(0, [0x3e, 0x7F, 0xb7]); // MVI A, $7F; ORA A
      cpu.step(); // MVI
      cpu.step(); // ORA A
      expect(cpu.f & FLAG_S).toBe(0);
    });
  });

  describe('all MOV variants', () => {
    it('covers all register-to-register MOVs', () => {
      // MOV D, E (0x53)
      mem.load(0, [0x53]);
      cpu.e = 0x42;
      cpu.step();
      expect(cpu.d).toBe(0x42);
    });

    it('MOV H, L', () => {
      mem.load(0, [0x65]); // MOV H, L
      cpu.l = 0x99;
      cpu.step();
      expect(cpu.h).toBe(0x99);
    });
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import { Z80 } from '../z80';
import { Memory, IOBus, FLAG_C, FLAG_N, FLAG_PV, FLAG_H, FLAG_Z, FLAG_S } from '../types';

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

describe('Z80 CPU', () => {
  let mem: TestMemory;
  let io: TestIO;
  let cpu: Z80;

  beforeEach(() => {
    mem = new TestMemory();
    io = new TestIO();
    cpu = new Z80(mem, io);
    cpu.reset();
  });

  describe('reset', () => {
    it('sets PC to 0', () => {
      expect(cpu.pc).toBe(0);
    });

    it('sets SP to 0xFFFF', () => {
      expect(cpu.sp).toBe(0xffff);
    });

    it('disables interrupts', () => {
      expect(cpu.iff1).toBe(false);
      expect(cpu.iff2).toBe(false);
    });

    it('sets IM to 0', () => {
      expect(cpu.im).toBe(0);
    });

    it('resets cycle counter', () => {
      expect(cpu.cycles).toBe(0);
    });
  });

  describe('8-bit load instructions', () => {
    it('LD B,n', () => {
      mem.load(0, [0x06, 0x42]); // LD B,$42
      cpu.step();
      expect(cpu.b).toBe(0x42);
      expect(cpu.cycles).toBe(7);
    });

    it('LD A,(BC)', () => {
      mem.load(0, [0x0a]); // LD A,(BC)
      cpu.b = 0x10; cpu.c = 0x20;
      mem.write(0x1020, 0x55);
      cpu.step();
      expect(cpu.a).toBe(0x55);
    });

    it('LD (BC),A', () => {
      mem.load(0, [0x02]); // LD (BC),A
      cpu.a = 0xAA;
      cpu.b = 0x20; cpu.c = 0x30;
      cpu.step();
      expect(mem.read(0x2030)).toBe(0xaa);
    });

    it('LD r,r transfers between registers', () => {
      mem.load(0, [0x41]); // LD B,C
      cpu.c = 0x37;
      cpu.step();
      expect(cpu.b).toBe(0x37);
    });

    it('LD (HL),n', () => {
      mem.load(0, [0x36, 0x99]); // LD (HL),$99
      cpu.h = 0x40; cpu.l = 0x00;
      cpu.step();
      expect(mem.read(0x4000)).toBe(0x99);
    });
  });

  describe('16-bit load instructions', () => {
    it('LD BC,nn', () => {
      mem.load(0, [0x01, 0x34, 0x12]); // LD BC,$1234
      cpu.step();
      expect(cpu.bc).toBe(0x1234);
    });

    it('LD DE,nn', () => {
      mem.load(0, [0x11, 0x78, 0x56]); // LD DE,$5678
      cpu.step();
      expect(cpu.de).toBe(0x5678);
    });

    it('LD HL,nn', () => {
      mem.load(0, [0x21, 0xBC, 0x9A]); // LD HL,$9ABC
      cpu.step();
      expect(cpu.hl).toBe(0x9abc);
    });

    it('LD SP,nn', () => {
      mem.load(0, [0x31, 0x00, 0x80]); // LD SP,$8000
      cpu.step();
      expect(cpu.sp).toBe(0x8000);
    });

    it('LD (nn),HL', () => {
      mem.load(0, [0x22, 0x00, 0x50]); // LD ($5000),HL
      cpu.hl = 0xABCD;
      cpu.step();
      expect(mem.read(0x5000)).toBe(0xcd);
      expect(mem.read(0x5001)).toBe(0xab);
    });

    it('LD HL,(nn)', () => {
      mem.load(0, [0x2a, 0x00, 0x60]); // LD HL,($6000)
      mem.write(0x6000, 0x34);
      mem.write(0x6001, 0x12);
      cpu.step();
      expect(cpu.hl).toBe(0x1234);
    });

    it('PUSH/POP BC', () => {
      cpu.sp = 0x8000;
      cpu.bc = 0x1234;
      mem.load(0, [0xc5, 0xc1]); // PUSH BC; POP BC
      cpu.step(); // PUSH
      expect(cpu.sp).toBe(0x7ffe);
      cpu.bc = 0x0000;
      cpu.step(); // POP
      expect(cpu.bc).toBe(0x1234);
    });
  });

  describe('8-bit ALU', () => {
    it('ADD A,B', () => {
      mem.load(0, [0x80]); // ADD A,B
      cpu.a = 0x10; cpu.b = 0x20;
      cpu.step();
      expect(cpu.a).toBe(0x30);
      expect(cpu.f & FLAG_Z).toBe(0);
      expect(cpu.f & FLAG_C).toBe(0);
    });

    it('ADD A,B with carry', () => {
      mem.load(0, [0x80]);
      cpu.a = 0xFF; cpu.b = 0x01;
      cpu.step();
      expect(cpu.a).toBe(0x00);
      expect(cpu.f & FLAG_Z).toBe(FLAG_Z);
      expect(cpu.f & FLAG_C).toBe(FLAG_C);
    });

    it('ADD A,B overflow', () => {
      mem.load(0, [0x80]);
      cpu.a = 0x7F; cpu.b = 0x01;
      cpu.step();
      expect(cpu.a).toBe(0x80);
      expect(cpu.f & FLAG_PV).toBe(FLAG_PV); // Overflow
      expect(cpu.f & FLAG_S).toBe(FLAG_S);   // Negative
    });

    it('SUB B', () => {
      mem.load(0, [0x90]);
      cpu.a = 0x30; cpu.b = 0x10;
      cpu.step();
      expect(cpu.a).toBe(0x20);
      expect(cpu.f & FLAG_N).toBe(FLAG_N); // Subtract flag set
    });

    it('SUB B with borrow', () => {
      mem.load(0, [0x90]);
      cpu.a = 0x00; cpu.b = 0x01;
      cpu.step();
      expect(cpu.a).toBe(0xff);
      expect(cpu.f & FLAG_C).toBe(FLAG_C);
    });

    it('AND B', () => {
      mem.load(0, [0xa0]);
      cpu.a = 0xF0; cpu.b = 0x0F;
      cpu.step();
      expect(cpu.a).toBe(0x00);
      expect(cpu.f & FLAG_Z).toBe(FLAG_Z);
      expect(cpu.f & FLAG_H).toBe(FLAG_H);
    });

    it('OR B', () => {
      mem.load(0, [0xb0]);
      cpu.a = 0xF0; cpu.b = 0x0F;
      cpu.step();
      expect(cpu.a).toBe(0xff);
    });

    it('XOR A clears A and sets zero', () => {
      mem.load(0, [0xaf]); // XOR A
      cpu.a = 0x42;
      cpu.step();
      expect(cpu.a).toBe(0x00);
      expect(cpu.f & FLAG_Z).toBe(FLAG_Z);
    });

    it('CP B sets flags without modifying A', () => {
      mem.load(0, [0xb8]);
      cpu.a = 0x42; cpu.b = 0x42;
      cpu.step();
      expect(cpu.a).toBe(0x42); // A unchanged
      expect(cpu.f & FLAG_Z).toBe(FLAG_Z);
    });

    it('INC B', () => {
      mem.load(0, [0x04]);
      cpu.b = 0x0F;
      cpu.step();
      expect(cpu.b).toBe(0x10);
      expect(cpu.f & FLAG_H).toBe(FLAG_H); // Half-carry on $0F -> $10
    });

    it('INC B wraps around and sets zero', () => {
      mem.load(0, [0x04]);
      cpu.b = 0xFF;
      cpu.step();
      expect(cpu.b).toBe(0x00);
      expect(cpu.f & FLAG_Z).toBe(FLAG_Z);
    });

    it('DEC B', () => {
      mem.load(0, [0x05]);
      cpu.b = 0x10;
      cpu.step();
      expect(cpu.b).toBe(0x0f);
      expect(cpu.f & FLAG_N).toBe(FLAG_N);
      expect(cpu.f & FLAG_H).toBe(FLAG_H);
    });
  });

  describe('16-bit arithmetic', () => {
    it('ADD HL,BC', () => {
      mem.load(0, [0x09]);
      cpu.hl = 0x1000; cpu.bc = 0x2000;
      cpu.step();
      expect(cpu.hl).toBe(0x3000);
    });

    it('ADD HL,BC with carry', () => {
      mem.load(0, [0x09]);
      cpu.hl = 0xF000; cpu.bc = 0x2000;
      cpu.step();
      expect(cpu.hl).toBe(0x1000);
      expect(cpu.f & FLAG_C).toBe(FLAG_C);
    });

    it('INC BC', () => {
      mem.load(0, [0x03]);
      cpu.bc = 0x00FF;
      cpu.step();
      expect(cpu.bc).toBe(0x0100);
    });

    it('DEC DE', () => {
      mem.load(0, [0x1b]);
      cpu.de = 0x0100;
      cpu.step();
      expect(cpu.de).toBe(0x00ff);
    });
  });

  describe('jumps and calls', () => {
    it('JP nn', () => {
      mem.load(0, [0xc3, 0x00, 0x80]); // JP $8000
      cpu.step();
      expect(cpu.pc).toBe(0x8000);
    });

    it('JP NZ,nn when Z=0', () => {
      mem.load(0, [0xc2, 0x00, 0x50]);
      cpu.f = 0; // Z clear
      cpu.step();
      expect(cpu.pc).toBe(0x5000);
    });

    it('JP NZ,nn when Z=1 does not jump', () => {
      mem.load(0, [0xc2, 0x00, 0x50]);
      cpu.f = FLAG_Z;
      cpu.step();
      expect(cpu.pc).toBe(0x0003); // Past the instruction
    });

    it('JR d (forward)', () => {
      mem.load(0, [0x18, 0x05]); // JR +5
      cpu.step();
      expect(cpu.pc).toBe(0x0007); // 2 (instruction length) + 5
    });

    it('JR d (backward)', () => {
      mem.load(0x100, [0x18, 0xFE]); // JR -2 (infinite loop)
      cpu.pc = 0x100;
      cpu.step();
      expect(cpu.pc).toBe(0x100);
    });

    it('CALL nn and RET', () => {
      cpu.sp = 0x8000;
      mem.load(0, [0xcd, 0x00, 0x50]); // CALL $5000
      mem.load(0x5000, [0xc9]);          // RET
      cpu.step(); // CALL
      expect(cpu.pc).toBe(0x5000);
      expect(cpu.sp).toBe(0x7ffe);
      cpu.step(); // RET
      expect(cpu.pc).toBe(0x0003);
      expect(cpu.sp).toBe(0x8000);
    });

    it('DJNZ loops B times', () => {
      mem.load(0, [0x06, 0x03, 0x10, 0xFE]); // LD B,3; DJNZ -2
      cpu.step(); // LD B,3
      expect(cpu.b).toBe(3);
      cpu.step(); // DJNZ: B=2, branch
      expect(cpu.b).toBe(2);
      expect(cpu.pc).toBe(2); // Looped back
      cpu.step(); // DJNZ: B=1, branch
      expect(cpu.b).toBe(1);
      cpu.step(); // DJNZ: B=0, fall through
      expect(cpu.b).toBe(0);
      expect(cpu.pc).toBe(4);
    });

    it('RST 38', () => {
      cpu.sp = 0x8000;
      mem.load(0x100, [0xff]); // RST $38
      cpu.pc = 0x100;
      cpu.step();
      expect(cpu.pc).toBe(0x0038);
      expect(cpu.sp).toBe(0x7ffe);
    });
  });

  describe('rotate and shift', () => {
    it('RLCA rotates A left through carry', () => {
      mem.load(0, [0x07]);
      cpu.a = 0x85; // 10000101
      cpu.step();
      expect(cpu.a).toBe(0x0b); // 00001011
      expect(cpu.f & FLAG_C).toBe(FLAG_C);
    });

    it('RRCA rotates A right through carry', () => {
      mem.load(0, [0x0f]);
      cpu.a = 0x85; // 10000101
      cpu.step();
      expect(cpu.a).toBe(0xc2); // 11000010 (bit 0 -> bit 7)
      expect(cpu.f & FLAG_C).toBe(FLAG_C);
    });

    it('CB RLC B', () => {
      mem.load(0, [0xcb, 0x00]); // RLC B
      cpu.b = 0x80;
      cpu.step();
      expect(cpu.b).toBe(0x01);
      expect(cpu.f & FLAG_C).toBe(FLAG_C);
    });

    it('CB SRL A', () => {
      mem.load(0, [0xcb, 0x3f]); // SRL A
      cpu.a = 0x81;
      cpu.step();
      expect(cpu.a).toBe(0x40);
      expect(cpu.f & FLAG_C).toBe(FLAG_C);
    });
  });

  describe('bit operations', () => {
    it('BIT 7,A tests bit 7', () => {
      mem.load(0, [0xcb, 0x7f]); // BIT 7,A
      cpu.a = 0x80;
      cpu.step();
      expect(cpu.f & FLAG_Z).toBe(0); // Bit 7 is set
    });

    it('BIT 0,A when bit 0 clear', () => {
      mem.load(0, [0xcb, 0x47]); // BIT 0,A
      cpu.a = 0xFE;
      cpu.step();
      expect(cpu.f & FLAG_Z).toBe(FLAG_Z);
    });

    it('SET 3,B', () => {
      mem.load(0, [0xcb, 0xd8]); // SET 3,B
      cpu.b = 0x00;
      cpu.step();
      expect(cpu.b).toBe(0x08);
    });

    it('RES 7,A', () => {
      mem.load(0, [0xcb, 0xbf]); // RES 7,A
      cpu.a = 0xFF;
      cpu.step();
      expect(cpu.a).toBe(0x7f);
    });
  });

  describe('exchange instructions', () => {
    it('EX AF,AF\'', () => {
      mem.load(0, [0x08]);
      cpu.a = 0x11; cpu.f = 0x22;
      cpu.a_ = 0x33; cpu.f_ = 0x44;
      cpu.step();
      expect(cpu.a).toBe(0x33);
      expect(cpu.f).toBe(0x44);
      expect(cpu.a_).toBe(0x11);
      expect(cpu.f_).toBe(0x22);
    });

    it('EXX exchanges BC,DE,HL with shadows', () => {
      mem.load(0, [0xd9]);
      cpu.bc = 0x1111; cpu.de = 0x2222; cpu.hl = 0x3333;
      cpu.b_ = 0xAA; cpu.c_ = 0xBB;
      cpu.d_ = 0xCC; cpu.e_ = 0xDD;
      cpu.h_ = 0xEE; cpu.l_ = 0xFF;
      cpu.step();
      expect(cpu.bc).toBe(0xAABB);
      expect(cpu.de).toBe(0xCCDD);
      expect(cpu.hl).toBe(0xEEFF);
    });

    it('EX DE,HL', () => {
      mem.load(0, [0xeb]);
      cpu.de = 0x1234; cpu.hl = 0x5678;
      cpu.step();
      expect(cpu.de).toBe(0x5678);
      expect(cpu.hl).toBe(0x1234);
    });
  });

  describe('IX/IY index operations (DD/FD prefix)', () => {
    it('LD IX,nn', () => {
      mem.load(0, [0xdd, 0x21, 0x34, 0x12]); // LD IX,$1234
      cpu.step();
      expect(cpu.ix).toBe(0x1234);
    });

    it('LD (IX+d),n', () => {
      mem.load(0, [0xdd, 0x36, 0x05, 0x42]); // LD (IX+5),$42
      cpu.ix = 0x1000;
      cpu.step();
      expect(mem.read(0x1005)).toBe(0x42);
    });

    it('LD A,(IX+d)', () => {
      mem.load(0, [0xdd, 0x7e, 0x03]); // LD A,(IX+3)
      cpu.ix = 0x2000;
      mem.write(0x2003, 0x77);
      cpu.step();
      expect(cpu.a).toBe(0x77);
    });

    it('ADD A,(IX+d)', () => {
      mem.load(0, [0xdd, 0x86, 0x02]); // ADD A,(IX+2)
      cpu.ix = 0x3000;
      cpu.a = 0x10;
      mem.write(0x3002, 0x20);
      cpu.step();
      expect(cpu.a).toBe(0x30);
    });

    it('LD IY,nn', () => {
      mem.load(0, [0xfd, 0x21, 0x78, 0x56]); // LD IY,$5678
      cpu.step();
      expect(cpu.iy).toBe(0x5678);
    });
  });

  describe('ED extended instructions', () => {
    it('LD I,A', () => {
      mem.load(0, [0xed, 0x47]);
      cpu.a = 0x42;
      cpu.step();
      expect(cpu.i).toBe(0x42);
    });

    it('LD A,I sets flags', () => {
      mem.load(0, [0xed, 0x57]);
      cpu.i = 0x80;
      cpu.iff2 = true;
      cpu.step();
      expect(cpu.a).toBe(0x80);
      expect(cpu.f & FLAG_S).toBe(FLAG_S);
      expect(cpu.f & FLAG_PV).toBe(FLAG_PV); // IFF2 copy
    });

    it('SBC HL,BC', () => {
      mem.load(0, [0xed, 0x42]);
      cpu.hl = 0x5000; cpu.bc = 0x2000;
      cpu.f = FLAG_C; // Carry set
      cpu.step();
      expect(cpu.hl).toBe(0x2FFF); // 0x5000 - 0x2000 - 1
    });

    it('ADC HL,DE', () => {
      mem.load(0, [0xed, 0x5a]);
      cpu.hl = 0x1000; cpu.de = 0x2000;
      cpu.f = FLAG_C;
      cpu.step();
      expect(cpu.hl).toBe(0x3001);
    });

    it('NEG', () => {
      mem.load(0, [0xed, 0x44]);
      cpu.a = 0x01;
      cpu.step();
      expect(cpu.a).toBe(0xff);
      expect(cpu.f & FLAG_C).toBe(FLAG_C);
      expect(cpu.f & FLAG_N).toBe(FLAG_N);
    });

    it('IM 1', () => {
      mem.load(0, [0xed, 0x56]);
      cpu.step();
      expect(cpu.im).toBe(1);
    });

    it('LDIR copies BC bytes from (HL) to (DE)', () => {
      // Copy 3 bytes from $1000 to $2000
      mem.load(0x1000, [0xAA, 0xBB, 0xCC]);
      cpu.hl = 0x1000; cpu.de = 0x2000; cpu.bc = 3;
      mem.load(0, [0xed, 0xb0]); // LDIR
      // Execute LDIR (it repeats until BC=0)
      cpu.step(); // BC=2, loops back
      expect(cpu.bc).toBe(2);
      cpu.step(); // BC=1
      expect(cpu.bc).toBe(1);
      cpu.step(); // BC=0, done
      expect(cpu.bc).toBe(0);
      expect(mem.read(0x2000)).toBe(0xAA);
      expect(mem.read(0x2001)).toBe(0xBB);
      expect(mem.read(0x2002)).toBe(0xCC);
    });

    it('LD (nn),BC via ED', () => {
      mem.load(0, [0xed, 0x43, 0x00, 0x50]); // LD ($5000),BC
      cpu.bc = 0xBEEF;
      cpu.step();
      expect(mem.read(0x5000)).toBe(0xEF);
      expect(mem.read(0x5001)).toBe(0xBE);
    });
  });

  describe('I/O instructions', () => {
    it('OUT (n),A', () => {
      mem.load(0, [0xd3, 0x10]); // OUT ($10),A
      cpu.a = 0x42;
      cpu.step();
      expect(io.lastOutPort).toBe(0x4210); // Port = (A << 8) | n
      expect(io.lastOutValue).toBe(0x42);
    });

    it('IN A,(n)', () => {
      mem.load(0, [0xdb, 0x20]); // IN A,($20)
      cpu.a = 0x55;
      io.inValues[0x20] = 0x77;
      // Port address is (A << 8) | n = $5520
      // But our test IO checks low byte only
      io.inValues[0x5520 & 0xff] = 0x77;
      cpu.step();
      // The actual port address is (A<<8)|n, and our TestIO checks the full port
      // Let's just verify A was set from the port read
      expect(cpu.a).toBe(io.in((0x55 << 8) | 0x20));
    });

    it('IN B,(C) via ED', () => {
      mem.load(0, [0xed, 0x40]); // IN B,(C)
      cpu.bc = 0x0110; // B=1, C=$10 -> port $0110
      io.inValues[0x0110] = 0x42;
      cpu.step();
      expect(cpu.b).toBe(0x42);
    });

    it('OUT (C),B via ED', () => {
      mem.load(0, [0xed, 0x41]); // OUT (C),B
      cpu.bc = 0x4210; // B=$42, C=$10
      cpu.step();
      expect(io.lastOutPort).toBe(0x4210);
      expect(io.lastOutValue).toBe(0x42);
    });
  });

  describe('interrupt handling', () => {
    it('DI disables interrupts', () => {
      mem.load(0, [0xf3]); // DI
      cpu.iff1 = true; cpu.iff2 = true;
      cpu.step();
      expect(cpu.iff1).toBe(false);
      expect(cpu.iff2).toBe(false);
    });

    it('EI enables interrupts after next instruction', () => {
      mem.load(0, [0xfb, 0x00]); // EI, NOP
      cpu.step(); // EI
      // Interrupts not yet enabled (delayed by one instruction)
      expect(cpu.iff1).toBe(false);
      cpu.step(); // NOP — EI takes effect
      expect(cpu.iff1).toBe(true);
      expect(cpu.iff2).toBe(true);
    });

    it('NMI pushes PC and jumps to $0066', () => {
      cpu.sp = 0x8000;
      cpu.pc = 0x1234;
      cpu.iff1 = true;
      cpu.nmi();
      expect(cpu.pc).toBe(0x0066);
      expect(cpu.iff1).toBe(false);
      expect(cpu.iff2).toBe(true); // IFF2 saved from IFF1
      expect(cpu.sp).toBe(0x7ffe);
    });

    it('IM 1 IRQ jumps to $0038', () => {
      cpu.sp = 0x8000;
      cpu.pc = 0x1234;
      cpu.iff1 = true;
      cpu.im = 1;
      cpu.irq();
      expect(cpu.pc).toBe(0x0038);
      expect(cpu.iff1).toBe(false);
    });

    it('IRQ ignored when interrupts disabled', () => {
      cpu.pc = 0x1234;
      cpu.iff1 = false;
      cpu.irq();
      expect(cpu.pc).toBe(0x1234); // Unchanged
    });
  });

  describe('HALT', () => {
    it('HALT stops execution', () => {
      mem.load(0, [0x76]); // HALT
      cpu.step();
      expect(cpu.halted).toBe(true);
    });

    it('HALT continues to count cycles', () => {
      mem.load(0, [0x76]);
      cpu.step(); // Enter HALT
      const c1 = cpu.cycles;
      cpu.step(); // Still halted
      expect(cpu.cycles).toBe(c1 + 4);
    });
  });

  describe('miscellaneous', () => {
    it('CPL complements A', () => {
      mem.load(0, [0x2f]);
      cpu.a = 0x55;
      cpu.step();
      expect(cpu.a).toBe(0xAA);
      expect(cpu.f & FLAG_H).toBe(FLAG_H);
      expect(cpu.f & FLAG_N).toBe(FLAG_N);
    });

    it('SCF sets carry', () => {
      mem.load(0, [0x37]);
      cpu.f = 0;
      cpu.step();
      expect(cpu.f & FLAG_C).toBe(FLAG_C);
    });

    it('CCF complements carry', () => {
      mem.load(0, [0x3f]);
      cpu.f = FLAG_C;
      cpu.step();
      expect(cpu.f & FLAG_C).toBe(0);
    });

    it('EX (SP),HL', () => {
      mem.load(0, [0xe3]);
      cpu.sp = 0x4000;
      cpu.hl = 0x1234;
      mem.write(0x4000, 0x78);
      mem.write(0x4001, 0x56);
      cpu.step();
      expect(cpu.hl).toBe(0x5678);
      expect(mem.read(0x4000)).toBe(0x34);
      expect(mem.read(0x4001)).toBe(0x12);
    });

    it('LD SP,HL', () => {
      mem.load(0, [0xf9]);
      cpu.hl = 0x5000;
      cpu.step();
      expect(cpu.sp).toBe(0x5000);
    });

    it('JP (HL)', () => {
      mem.load(0, [0xe9]);
      cpu.hl = 0x3000;
      cpu.step();
      expect(cpu.pc).toBe(0x3000);
    });
  });

  describe('integration: simple program', () => {
    it('counts down from 10 to 0', () => {
      // LD A,10; loop: DEC A; JP NZ,loop; HALT
      mem.load(0, [
        0x3e, 0x0a,       // LD A,10
        0x3d,             // DEC A
        0xc2, 0x02, 0x00, // JP NZ,$0002
        0x76,             // HALT
      ]);
      cpu.run(1000);
      expect(cpu.halted).toBe(true);
      expect(cpu.a).toBe(0);
    });

    it('sums bytes using LDIR', () => {
      // Set up data at $1000: [1, 2, 3, 4, 5]
      mem.load(0x1000, [1, 2, 3, 4, 5]);
      // Copy to $2000 using LDIR, then sum at $2000
      mem.load(0, [
        0x21, 0x00, 0x10, // LD HL,$1000
        0x11, 0x00, 0x20, // LD DE,$2000
        0x01, 0x05, 0x00, // LD BC,5
        0xed, 0xb0,       // LDIR
        0x76,             // HALT
      ]);
      cpu.run(1000);
      expect(cpu.halted).toBe(true);
      expect(mem.read(0x2000)).toBe(1);
      expect(mem.read(0x2001)).toBe(2);
      expect(mem.read(0x2002)).toBe(3);
      expect(mem.read(0x2003)).toBe(4);
      expect(mem.read(0x2004)).toBe(5);
      expect(cpu.bc).toBe(0);
    });
  });
});

/**
 * Zilog Z80 CPU Emulator
 *
 * Implements the documented Z80 instruction set including:
 * - Main instruction table (unprefixed)
 * - CB prefix: bit operations, rotates, shifts
 * - DD prefix: IX register operations
 * - ED prefix: extended instructions (block transfers, I/O, etc.)
 * - FD prefix: IY register operations
 * - DD CB / FD CB: indexed bit operations
 */

import {
  Memory, IOBus, Z80State, NullIOBus,
  FLAG_C, FLAG_N, FLAG_PV, FLAG_H, FLAG_Z, FLAG_S,
} from './types';
import { PARITY_TABLE, buildSZTable } from './tables';

const SZ_TABLE = buildSZTable();

export class Z80 {
  // Main registers
  a = 0; f = 0;
  b = 0; c = 0;
  d = 0; e = 0;
  h = 0; l = 0;

  // Shadow registers
  a_ = 0; f_ = 0;
  b_ = 0; c_ = 0;
  d_ = 0; e_ = 0;
  h_ = 0; l_ = 0;

  // Index registers
  ix = 0; iy = 0;

  // Special registers
  sp = 0xffff;
  pc = 0;
  i = 0;  // Interrupt vector base
  r = 0;  // Memory refresh counter

  // Interrupt state
  iff1 = false;
  iff2 = false;
  im: 0 | 1 | 2 = 0;
  halted = false;

  // Cycle counter
  cycles = 0;

  // Internal: pending EI (delay one instruction)
  private eiPending = false;

  private memory: Memory;
  private io: IOBus;

  constructor(memory: Memory, io?: IOBus) {
    this.memory = memory;
    this.io = io ?? new NullIOBus();
  }

  // --- Register pair accessors ---
  get af(): number { return (this.a << 8) | this.f; }
  set af(v: number) { this.a = (v >> 8) & 0xff; this.f = v & 0xff; }

  get bc(): number { return (this.b << 8) | this.c; }
  set bc(v: number) { this.b = (v >> 8) & 0xff; this.c = v & 0xff; }

  get de(): number { return (this.d << 8) | this.e; }
  set de(v: number) { this.d = (v >> 8) & 0xff; this.e = v & 0xff; }

  get hl(): number { return (this.h << 8) | this.l; }
  set hl(v: number) { this.h = (v >> 8) & 0xff; this.l = v & 0xff; }

  // --- Memory access ---
  read(addr: number): number {
    return this.memory.read(addr & 0xffff);
  }

  write(addr: number, value: number): void {
    this.memory.write(addr & 0xffff, value & 0xff);
  }

  read16(addr: number): number {
    const lo = this.read(addr);
    const hi = this.read(addr + 1);
    return (hi << 8) | lo;
  }

  write16(addr: number, value: number): void {
    this.write(addr, value & 0xff);
    this.write(addr + 1, (value >> 8) & 0xff);
  }

  // --- Fetch from PC ---
  fetchByte(): number {
    const v = this.read(this.pc);
    this.pc = (this.pc + 1) & 0xffff;
    return v;
  }

  fetchWord(): number {
    const lo = this.fetchByte();
    const hi = this.fetchByte();
    return (hi << 8) | lo;
  }

  fetchDisplacement(): number {
    const d = this.fetchByte();
    return d < 128 ? d : d - 256;
  }

  // --- Stack operations ---
  pushWord(value: number): void {
    this.sp = (this.sp - 1) & 0xffff;
    this.write(this.sp, (value >> 8) & 0xff);
    this.sp = (this.sp - 1) & 0xffff;
    this.write(this.sp, value & 0xff);
  }

  popWord(): number {
    const lo = this.read(this.sp);
    this.sp = (this.sp + 1) & 0xffff;
    const hi = this.read(this.sp);
    this.sp = (this.sp + 1) & 0xffff;
    return (hi << 8) | lo;
  }

  // --- I/O ---
  ioRead(port: number): number {
    return this.io.in(port & 0xffff);
  }

  ioWrite(port: number, value: number): void {
    this.io.out(port & 0xffff, value & 0xff);
  }

  // --- Flag helpers ---
  getFlag(flag: number): boolean {
    return (this.f & flag) !== 0;
  }

  setFlag(flag: number, v: boolean): void {
    if (v) this.f |= flag;
    else this.f &= ~flag;
  }

  /** Set S, Z, and P/V (parity) flags from result byte. */
  setSZP(value: number): void {
    this.f = (this.f & FLAG_C) | SZ_TABLE[value & 0xff] | PARITY_TABLE[value & 0xff];
  }

  // --- ALU operations ---
  add8(a: number, b: number): number {
    const result = a + b;
    const r8 = result & 0xff;
    this.f =
      SZ_TABLE[r8] |
      (result > 0xff ? FLAG_C : 0) |
      ((a ^ b ^ r8) & FLAG_H) |
      ((((a ^ b) ^ 0x80) & (a ^ r8) & 0x80) ? FLAG_PV : 0);
    return r8;
  }

  adc8(a: number, b: number): number {
    const carry = this.f & FLAG_C;
    const result = a + b + carry;
    const r8 = result & 0xff;
    this.f =
      SZ_TABLE[r8] |
      (result > 0xff ? FLAG_C : 0) |
      ((a ^ b ^ r8) & FLAG_H) |
      ((((a ^ b) ^ 0x80) & (a ^ r8) & 0x80) ? FLAG_PV : 0);
    return r8;
  }

  sub8(a: number, b: number): number {
    const result = a - b;
    const r8 = result & 0xff;
    this.f =
      SZ_TABLE[r8] | FLAG_N |
      (result < 0 ? FLAG_C : 0) |
      ((a ^ b ^ r8) & FLAG_H) |
      (((a ^ b) & (a ^ r8) & 0x80) ? FLAG_PV : 0);
    return r8;
  }

  sbc8(a: number, b: number): number {
    const carry = this.f & FLAG_C;
    const result = a - b - carry;
    const r8 = result & 0xff;
    this.f =
      SZ_TABLE[r8] | FLAG_N |
      (result < 0 ? FLAG_C : 0) |
      ((a ^ b ^ r8) & FLAG_H) |
      (((a ^ b) & (a ^ r8) & 0x80) ? FLAG_PV : 0);
    return r8;
  }

  and8(value: number): void {
    this.a &= value;
    this.f = SZ_TABLE[this.a] | FLAG_H | PARITY_TABLE[this.a];
  }

  or8(value: number): void {
    this.a |= value;
    this.f = SZ_TABLE[this.a] | PARITY_TABLE[this.a];
  }

  xor8(value: number): void {
    this.a ^= value;
    this.f = SZ_TABLE[this.a] | PARITY_TABLE[this.a];
  }

  cp8(value: number): void {
    // Compare: same as SUB but result is discarded
    const result = this.a - value;
    const r8 = result & 0xff;
    this.f =
      SZ_TABLE[r8] | FLAG_N |
      (result < 0 ? FLAG_C : 0) |
      ((this.a ^ value ^ r8) & FLAG_H) |
      (((this.a ^ value) & (this.a ^ r8) & 0x80) ? FLAG_PV : 0);
  }

  inc8(value: number): number {
    const result = (value + 1) & 0xff;
    this.f =
      (this.f & FLAG_C) |
      SZ_TABLE[result] |
      (value === 0x7f ? FLAG_PV : 0) |
      ((value & 0x0f) === 0x0f ? FLAG_H : 0);
    return result;
  }

  dec8(value: number): number {
    const result = (value - 1) & 0xff;
    this.f =
      (this.f & FLAG_C) | FLAG_N |
      SZ_TABLE[result] |
      (value === 0x80 ? FLAG_PV : 0) |
      ((value & 0x0f) === 0x00 ? FLAG_H : 0);
    return result;
  }

  addHL(value: number): void {
    const hl = this.hl;
    const result = hl + value;
    this.f =
      (this.f & (FLAG_S | FLAG_Z | FLAG_PV)) |
      (result > 0xffff ? FLAG_C : 0) |
      ((hl ^ value ^ result) & 0x1000 ? FLAG_H : 0);
    this.hl = result & 0xffff;
  }

  adcHL(value: number): void {
    const hl = this.hl;
    const carry = this.f & FLAG_C;
    const result = hl + value + carry;
    const r16 = result & 0xffff;
    this.f =
      (r16 === 0 ? FLAG_Z : 0) |
      ((r16 >> 8) & FLAG_S) |
      (result > 0xffff ? FLAG_C : 0) |
      ((hl ^ value ^ r16) & 0x1000 ? FLAG_H : 0) |
      ((((hl ^ value) ^ 0x8000) & (hl ^ r16) & 0x8000) ? FLAG_PV : 0);
    this.hl = r16;
  }

  sbcHL(value: number): void {
    const hl = this.hl;
    const carry = this.f & FLAG_C;
    const result = hl - value - carry;
    const r16 = result & 0xffff;
    this.f =
      FLAG_N |
      (r16 === 0 ? FLAG_Z : 0) |
      ((r16 >> 8) & FLAG_S) |
      (result < 0 ? FLAG_C : 0) |
      ((hl ^ value ^ r16) & 0x1000 ? FLAG_H : 0) |
      (((hl ^ value) & (hl ^ r16) & 0x8000) ? FLAG_PV : 0);
    this.hl = r16;
  }

  // --- Rotate/Shift operations ---
  rlc(value: number): number {
    const carry = (value >> 7) & 1;
    const result = ((value << 1) | carry) & 0xff;
    this.f = SZ_TABLE[result] | PARITY_TABLE[result] | carry;
    return result;
  }

  rrc(value: number): number {
    const carry = value & 1;
    const result = ((value >> 1) | (carry << 7)) & 0xff;
    this.f = SZ_TABLE[result] | PARITY_TABLE[result] | carry;
    return result;
  }

  rl(value: number): number {
    const oldCarry = this.f & FLAG_C;
    const carry = (value >> 7) & 1;
    const result = ((value << 1) | oldCarry) & 0xff;
    this.f = SZ_TABLE[result] | PARITY_TABLE[result] | carry;
    return result;
  }

  rr(value: number): number {
    const oldCarry = this.f & FLAG_C;
    const carry = value & 1;
    const result = ((value >> 1) | (oldCarry << 7)) & 0xff;
    this.f = SZ_TABLE[result] | PARITY_TABLE[result] | carry;
    return result;
  }

  sla(value: number): number {
    const carry = (value >> 7) & 1;
    const result = (value << 1) & 0xff;
    this.f = SZ_TABLE[result] | PARITY_TABLE[result] | carry;
    return result;
  }

  sll(value: number): number {
    const carry = (value >> 7) & 1;
    const result = ((value << 1) | 1) & 0xff;
    this.f = SZ_TABLE[result] | PARITY_TABLE[result] | carry;
    return result;
  }

  sra(value: number): number {
    const carry = value & 1;
    const result = ((value >> 1) | (value & 0x80)) & 0xff;
    this.f = SZ_TABLE[result] | PARITY_TABLE[result] | carry;
    return result;
  }

  srl(value: number): number {
    const carry = value & 1;
    const result = (value >> 1) & 0xff;
    this.f = SZ_TABLE[result] | PARITY_TABLE[result] | carry;
    return result;
  }

  // --- Bit test ---
  bit(n: number, value: number): void {
    const result = value & (1 << n);
    this.f =
      (this.f & FLAG_C) | FLAG_H |
      (result === 0 ? (FLAG_Z | FLAG_PV) : 0) |
      (n === 7 && result ? FLAG_S : 0);
  }

  // --- Reset / NMI / IRQ ---
  reset(): void {
    this.a = this.f = 0xff;
    this.b = this.c = this.d = this.e = this.h = this.l = 0;
    this.a_ = this.f_ = 0xff;
    this.b_ = this.c_ = this.d_ = this.e_ = this.h_ = this.l_ = 0;
    this.ix = this.iy = 0;
    this.sp = 0xffff;
    this.pc = 0;
    this.i = 0;
    this.r = 0;
    this.iff1 = this.iff2 = false;
    this.im = 0;
    this.halted = false;
    this.cycles = 0;
    this.eiPending = false;
  }

  nmi(): void {
    this.halted = false;
    this.iff2 = this.iff1;
    this.iff1 = false;
    this.pushWord(this.pc);
    this.pc = 0x0066;
    this.cycles += 11;
  }

  irq(data: number = 0xff): void {
    if (!this.iff1) return;
    this.halted = false;
    this.iff1 = this.iff2 = false;

    switch (this.im) {
      case 0:
        // Execute instruction on data bus (typically RST)
        this.pushWord(this.pc);
        this.pc = data & 0x38;
        this.cycles += 13;
        break;
      case 1:
        this.pushWord(this.pc);
        this.pc = 0x0038;
        this.cycles += 13;
        break;
      case 2: {
        this.pushWord(this.pc);
        const vector = (this.i << 8) | (data & 0xfe);
        this.pc = this.read16(vector);
        this.cycles += 19;
        break;
      }
    }
  }

  // --- Execute single instruction ---
  step(): number {
    if (this.halted) {
      this.cycles += 4;
      this.r = (this.r & 0x80) | ((this.r + 1) & 0x7f);
      return 4;
    }

    // Handle delayed EI
    if (this.eiPending) {
      this.iff1 = this.iff2 = true;
      this.eiPending = false;
    }

    const startCycles = this.cycles;
    this.r = (this.r & 0x80) | ((this.r + 1) & 0x7f);

    const opcode = this.fetchByte();
    this.execMain(opcode);

    return this.cycles - startCycles;
  }

  // --- Main opcode dispatch ---
  private execMain(op: number): void {
    switch (op) {
      // NOP
      case 0x00: this.cycles += 4; break;

      // LD BC,nn
      case 0x01: this.bc = this.fetchWord(); this.cycles += 10; break;
      // LD (BC),A
      case 0x02: this.write(this.bc, this.a); this.cycles += 7; break;
      // INC BC
      case 0x03: this.bc = (this.bc + 1) & 0xffff; this.cycles += 6; break;
      // INC B
      case 0x04: this.b = this.inc8(this.b); this.cycles += 4; break;
      // DEC B
      case 0x05: this.b = this.dec8(this.b); this.cycles += 4; break;
      // LD B,n
      case 0x06: this.b = this.fetchByte(); this.cycles += 7; break;
      // RLCA
      case 0x07: {
        const carry = (this.a >> 7) & 1;
        this.a = ((this.a << 1) | carry) & 0xff;
        this.f = (this.f & (FLAG_S | FLAG_Z | FLAG_PV)) | carry;
        this.cycles += 4;
        break;
      }
      // EX AF,AF'
      case 0x08: {
        let t = this.a; this.a = this.a_; this.a_ = t;
        t = this.f; this.f = this.f_; this.f_ = t;
        this.cycles += 4;
        break;
      }
      // ADD HL,BC
      case 0x09: this.addHL(this.bc); this.cycles += 11; break;
      // LD A,(BC)
      case 0x0a: this.a = this.read(this.bc); this.cycles += 7; break;
      // DEC BC
      case 0x0b: this.bc = (this.bc - 1) & 0xffff; this.cycles += 6; break;
      // INC C
      case 0x0c: this.c = this.inc8(this.c); this.cycles += 4; break;
      // DEC C
      case 0x0d: this.c = this.dec8(this.c); this.cycles += 4; break;
      // LD C,n
      case 0x0e: this.c = this.fetchByte(); this.cycles += 7; break;
      // RRCA
      case 0x0f: {
        const carry = this.a & 1;
        this.a = ((this.a >> 1) | (carry << 7)) & 0xff;
        this.f = (this.f & (FLAG_S | FLAG_Z | FLAG_PV)) | carry;
        this.cycles += 4;
        break;
      }

      // DJNZ d
      case 0x10: {
        const d = this.fetchDisplacement();
        this.b = (this.b - 1) & 0xff;
        if (this.b !== 0) {
          this.pc = (this.pc + d) & 0xffff;
          this.cycles += 13;
        } else {
          this.cycles += 8;
        }
        break;
      }
      // LD DE,nn
      case 0x11: this.de = this.fetchWord(); this.cycles += 10; break;
      // LD (DE),A
      case 0x12: this.write(this.de, this.a); this.cycles += 7; break;
      // INC DE
      case 0x13: this.de = (this.de + 1) & 0xffff; this.cycles += 6; break;
      // INC D
      case 0x14: this.d = this.inc8(this.d); this.cycles += 4; break;
      // DEC D
      case 0x15: this.d = this.dec8(this.d); this.cycles += 4; break;
      // LD D,n
      case 0x16: this.d = this.fetchByte(); this.cycles += 7; break;
      // RLA
      case 0x17: {
        const oldCarry = this.f & FLAG_C;
        const carry = (this.a >> 7) & 1;
        this.a = ((this.a << 1) | oldCarry) & 0xff;
        this.f = (this.f & (FLAG_S | FLAG_Z | FLAG_PV)) | carry;
        this.cycles += 4;
        break;
      }
      // JR d
      case 0x18: {
        const d = this.fetchDisplacement();
        this.pc = (this.pc + d) & 0xffff;
        this.cycles += 12;
        break;
      }
      // ADD HL,DE
      case 0x19: this.addHL(this.de); this.cycles += 11; break;
      // LD A,(DE)
      case 0x1a: this.a = this.read(this.de); this.cycles += 7; break;
      // DEC DE
      case 0x1b: this.de = (this.de - 1) & 0xffff; this.cycles += 6; break;
      // INC E
      case 0x1c: this.e = this.inc8(this.e); this.cycles += 4; break;
      // DEC E
      case 0x1d: this.e = this.dec8(this.e); this.cycles += 4; break;
      // LD E,n
      case 0x1e: this.e = this.fetchByte(); this.cycles += 7; break;
      // RRA
      case 0x1f: {
        const oldCarry = this.f & FLAG_C;
        const carry = this.a & 1;
        this.a = ((this.a >> 1) | (oldCarry << 7)) & 0xff;
        this.f = (this.f & (FLAG_S | FLAG_Z | FLAG_PV)) | carry;
        this.cycles += 4;
        break;
      }

      // JR NZ,d
      case 0x20: {
        const d = this.fetchDisplacement();
        if (!(this.f & FLAG_Z)) { this.pc = (this.pc + d) & 0xffff; this.cycles += 12; }
        else { this.cycles += 7; }
        break;
      }
      // LD HL,nn
      case 0x21: this.hl = this.fetchWord(); this.cycles += 10; break;
      // LD (nn),HL
      case 0x22: { const a = this.fetchWord(); this.write16(a, this.hl); this.cycles += 16; break; }
      // INC HL
      case 0x23: this.hl = (this.hl + 1) & 0xffff; this.cycles += 6; break;
      // INC H
      case 0x24: this.h = this.inc8(this.h); this.cycles += 4; break;
      // DEC H
      case 0x25: this.h = this.dec8(this.h); this.cycles += 4; break;
      // LD H,n
      case 0x26: this.h = this.fetchByte(); this.cycles += 7; break;
      // DAA
      case 0x27: this.daa(); this.cycles += 4; break;
      // JR Z,d
      case 0x28: {
        const d = this.fetchDisplacement();
        if (this.f & FLAG_Z) { this.pc = (this.pc + d) & 0xffff; this.cycles += 12; }
        else { this.cycles += 7; }
        break;
      }
      // ADD HL,HL
      case 0x29: this.addHL(this.hl); this.cycles += 11; break;
      // LD HL,(nn)
      case 0x2a: { const a = this.fetchWord(); this.hl = this.read16(a); this.cycles += 16; break; }
      // DEC HL
      case 0x2b: this.hl = (this.hl - 1) & 0xffff; this.cycles += 6; break;
      // INC L
      case 0x2c: this.l = this.inc8(this.l); this.cycles += 4; break;
      // DEC L
      case 0x2d: this.l = this.dec8(this.l); this.cycles += 4; break;
      // LD L,n
      case 0x2e: this.l = this.fetchByte(); this.cycles += 7; break;
      // CPL
      case 0x2f: this.a ^= 0xff; this.f |= (FLAG_H | FLAG_N); this.cycles += 4; break;

      // JR NC,d
      case 0x30: {
        const d = this.fetchDisplacement();
        if (!(this.f & FLAG_C)) { this.pc = (this.pc + d) & 0xffff; this.cycles += 12; }
        else { this.cycles += 7; }
        break;
      }
      // LD SP,nn
      case 0x31: this.sp = this.fetchWord(); this.cycles += 10; break;
      // LD (nn),A
      case 0x32: { const a = this.fetchWord(); this.write(a, this.a); this.cycles += 13; break; }
      // INC SP
      case 0x33: this.sp = (this.sp + 1) & 0xffff; this.cycles += 6; break;
      // INC (HL)
      case 0x34: this.write(this.hl, this.inc8(this.read(this.hl))); this.cycles += 11; break;
      // DEC (HL)
      case 0x35: this.write(this.hl, this.dec8(this.read(this.hl))); this.cycles += 11; break;
      // LD (HL),n
      case 0x36: this.write(this.hl, this.fetchByte()); this.cycles += 10; break;
      // SCF
      case 0x37: this.f = (this.f & (FLAG_S | FLAG_Z | FLAG_PV)) | FLAG_C; this.cycles += 4; break;
      // JR C,d
      case 0x38: {
        const d = this.fetchDisplacement();
        if (this.f & FLAG_C) { this.pc = (this.pc + d) & 0xffff; this.cycles += 12; }
        else { this.cycles += 7; }
        break;
      }
      // ADD HL,SP
      case 0x39: this.addHL(this.sp); this.cycles += 11; break;
      // LD A,(nn)
      case 0x3a: { const a = this.fetchWord(); this.a = this.read(a); this.cycles += 13; break; }
      // DEC SP
      case 0x3b: this.sp = (this.sp - 1) & 0xffff; this.cycles += 6; break;
      // INC A
      case 0x3c: this.a = this.inc8(this.a); this.cycles += 4; break;
      // DEC A
      case 0x3d: this.a = this.dec8(this.a); this.cycles += 4; break;
      // LD A,n
      case 0x3e: this.a = this.fetchByte(); this.cycles += 7; break;
      // CCF
      case 0x3f: {
        const oldC = this.f & FLAG_C;
        this.f = (this.f & (FLAG_S | FLAG_Z | FLAG_PV)) | (oldC ? FLAG_H : 0) | (oldC ? 0 : FLAG_C);
        this.cycles += 4;
        break;
      }

      // --- LD r,r' block (0x40-0x7F) ---
      // LD B,r
      case 0x40: this.cycles += 4; break; // LD B,B
      case 0x41: this.b = this.c; this.cycles += 4; break;
      case 0x42: this.b = this.d; this.cycles += 4; break;
      case 0x43: this.b = this.e; this.cycles += 4; break;
      case 0x44: this.b = this.h; this.cycles += 4; break;
      case 0x45: this.b = this.l; this.cycles += 4; break;
      case 0x46: this.b = this.read(this.hl); this.cycles += 7; break;
      case 0x47: this.b = this.a; this.cycles += 4; break;
      // LD C,r
      case 0x48: this.c = this.b; this.cycles += 4; break;
      case 0x49: this.cycles += 4; break; // LD C,C
      case 0x4a: this.c = this.d; this.cycles += 4; break;
      case 0x4b: this.c = this.e; this.cycles += 4; break;
      case 0x4c: this.c = this.h; this.cycles += 4; break;
      case 0x4d: this.c = this.l; this.cycles += 4; break;
      case 0x4e: this.c = this.read(this.hl); this.cycles += 7; break;
      case 0x4f: this.c = this.a; this.cycles += 4; break;
      // LD D,r
      case 0x50: this.d = this.b; this.cycles += 4; break;
      case 0x51: this.d = this.c; this.cycles += 4; break;
      case 0x52: this.cycles += 4; break; // LD D,D
      case 0x53: this.d = this.e; this.cycles += 4; break;
      case 0x54: this.d = this.h; this.cycles += 4; break;
      case 0x55: this.d = this.l; this.cycles += 4; break;
      case 0x56: this.d = this.read(this.hl); this.cycles += 7; break;
      case 0x57: this.d = this.a; this.cycles += 4; break;
      // LD E,r
      case 0x58: this.e = this.b; this.cycles += 4; break;
      case 0x59: this.e = this.c; this.cycles += 4; break;
      case 0x5a: this.e = this.d; this.cycles += 4; break;
      case 0x5b: this.cycles += 4; break; // LD E,E
      case 0x5c: this.e = this.h; this.cycles += 4; break;
      case 0x5d: this.e = this.l; this.cycles += 4; break;
      case 0x5e: this.e = this.read(this.hl); this.cycles += 7; break;
      case 0x5f: this.e = this.a; this.cycles += 4; break;
      // LD H,r
      case 0x60: this.h = this.b; this.cycles += 4; break;
      case 0x61: this.h = this.c; this.cycles += 4; break;
      case 0x62: this.h = this.d; this.cycles += 4; break;
      case 0x63: this.h = this.e; this.cycles += 4; break;
      case 0x64: this.cycles += 4; break; // LD H,H
      case 0x65: this.h = this.l; this.cycles += 4; break;
      case 0x66: this.h = this.read(this.hl); this.cycles += 7; break;
      case 0x67: this.h = this.a; this.cycles += 4; break;
      // LD L,r
      case 0x68: this.l = this.b; this.cycles += 4; break;
      case 0x69: this.l = this.c; this.cycles += 4; break;
      case 0x6a: this.l = this.d; this.cycles += 4; break;
      case 0x6b: this.l = this.e; this.cycles += 4; break;
      case 0x6c: this.l = this.h; this.cycles += 4; break;
      case 0x6d: this.cycles += 4; break; // LD L,L
      case 0x6e: this.l = this.read(this.hl); this.cycles += 7; break;
      case 0x6f: this.l = this.a; this.cycles += 4; break;
      // LD (HL),r
      case 0x70: this.write(this.hl, this.b); this.cycles += 7; break;
      case 0x71: this.write(this.hl, this.c); this.cycles += 7; break;
      case 0x72: this.write(this.hl, this.d); this.cycles += 7; break;
      case 0x73: this.write(this.hl, this.e); this.cycles += 7; break;
      case 0x74: this.write(this.hl, this.h); this.cycles += 7; break;
      case 0x75: this.write(this.hl, this.l); this.cycles += 7; break;
      // HALT
      case 0x76: this.halted = true; this.pc = (this.pc - 1) & 0xffff; this.cycles += 4; break;
      case 0x77: this.write(this.hl, this.a); this.cycles += 7; break;
      // LD A,r
      case 0x78: this.a = this.b; this.cycles += 4; break;
      case 0x79: this.a = this.c; this.cycles += 4; break;
      case 0x7a: this.a = this.d; this.cycles += 4; break;
      case 0x7b: this.a = this.e; this.cycles += 4; break;
      case 0x7c: this.a = this.h; this.cycles += 4; break;
      case 0x7d: this.a = this.l; this.cycles += 4; break;
      case 0x7e: this.a = this.read(this.hl); this.cycles += 7; break;
      case 0x7f: this.cycles += 4; break; // LD A,A

      // --- ALU A,r block (0x80-0xBF) ---
      // ADD A,r
      case 0x80: this.a = this.add8(this.a, this.b); this.cycles += 4; break;
      case 0x81: this.a = this.add8(this.a, this.c); this.cycles += 4; break;
      case 0x82: this.a = this.add8(this.a, this.d); this.cycles += 4; break;
      case 0x83: this.a = this.add8(this.a, this.e); this.cycles += 4; break;
      case 0x84: this.a = this.add8(this.a, this.h); this.cycles += 4; break;
      case 0x85: this.a = this.add8(this.a, this.l); this.cycles += 4; break;
      case 0x86: this.a = this.add8(this.a, this.read(this.hl)); this.cycles += 7; break;
      case 0x87: this.a = this.add8(this.a, this.a); this.cycles += 4; break;
      // ADC A,r
      case 0x88: this.a = this.adc8(this.a, this.b); this.cycles += 4; break;
      case 0x89: this.a = this.adc8(this.a, this.c); this.cycles += 4; break;
      case 0x8a: this.a = this.adc8(this.a, this.d); this.cycles += 4; break;
      case 0x8b: this.a = this.adc8(this.a, this.e); this.cycles += 4; break;
      case 0x8c: this.a = this.adc8(this.a, this.h); this.cycles += 4; break;
      case 0x8d: this.a = this.adc8(this.a, this.l); this.cycles += 4; break;
      case 0x8e: this.a = this.adc8(this.a, this.read(this.hl)); this.cycles += 7; break;
      case 0x8f: this.a = this.adc8(this.a, this.a); this.cycles += 4; break;
      // SUB r
      case 0x90: this.a = this.sub8(this.a, this.b); this.cycles += 4; break;
      case 0x91: this.a = this.sub8(this.a, this.c); this.cycles += 4; break;
      case 0x92: this.a = this.sub8(this.a, this.d); this.cycles += 4; break;
      case 0x93: this.a = this.sub8(this.a, this.e); this.cycles += 4; break;
      case 0x94: this.a = this.sub8(this.a, this.h); this.cycles += 4; break;
      case 0x95: this.a = this.sub8(this.a, this.l); this.cycles += 4; break;
      case 0x96: this.a = this.sub8(this.a, this.read(this.hl)); this.cycles += 7; break;
      case 0x97: this.a = this.sub8(this.a, this.a); this.cycles += 4; break;
      // SBC A,r
      case 0x98: this.a = this.sbc8(this.a, this.b); this.cycles += 4; break;
      case 0x99: this.a = this.sbc8(this.a, this.c); this.cycles += 4; break;
      case 0x9a: this.a = this.sbc8(this.a, this.d); this.cycles += 4; break;
      case 0x9b: this.a = this.sbc8(this.a, this.e); this.cycles += 4; break;
      case 0x9c: this.a = this.sbc8(this.a, this.h); this.cycles += 4; break;
      case 0x9d: this.a = this.sbc8(this.a, this.l); this.cycles += 4; break;
      case 0x9e: this.a = this.sbc8(this.a, this.read(this.hl)); this.cycles += 7; break;
      case 0x9f: this.a = this.sbc8(this.a, this.a); this.cycles += 4; break;
      // AND r
      case 0xa0: this.and8(this.b); this.cycles += 4; break;
      case 0xa1: this.and8(this.c); this.cycles += 4; break;
      case 0xa2: this.and8(this.d); this.cycles += 4; break;
      case 0xa3: this.and8(this.e); this.cycles += 4; break;
      case 0xa4: this.and8(this.h); this.cycles += 4; break;
      case 0xa5: this.and8(this.l); this.cycles += 4; break;
      case 0xa6: this.and8(this.read(this.hl)); this.cycles += 7; break;
      case 0xa7: this.and8(this.a); this.cycles += 4; break;
      // XOR r
      case 0xa8: this.xor8(this.b); this.cycles += 4; break;
      case 0xa9: this.xor8(this.c); this.cycles += 4; break;
      case 0xaa: this.xor8(this.d); this.cycles += 4; break;
      case 0xab: this.xor8(this.e); this.cycles += 4; break;
      case 0xac: this.xor8(this.h); this.cycles += 4; break;
      case 0xad: this.xor8(this.l); this.cycles += 4; break;
      case 0xae: this.xor8(this.read(this.hl)); this.cycles += 7; break;
      case 0xaf: this.xor8(this.a); this.cycles += 4; break;
      // OR r
      case 0xb0: this.or8(this.b); this.cycles += 4; break;
      case 0xb1: this.or8(this.c); this.cycles += 4; break;
      case 0xb2: this.or8(this.d); this.cycles += 4; break;
      case 0xb3: this.or8(this.e); this.cycles += 4; break;
      case 0xb4: this.or8(this.h); this.cycles += 4; break;
      case 0xb5: this.or8(this.l); this.cycles += 4; break;
      case 0xb6: this.or8(this.read(this.hl)); this.cycles += 7; break;
      case 0xb7: this.or8(this.a); this.cycles += 4; break;
      // CP r
      case 0xb8: this.cp8(this.b); this.cycles += 4; break;
      case 0xb9: this.cp8(this.c); this.cycles += 4; break;
      case 0xba: this.cp8(this.d); this.cycles += 4; break;
      case 0xbb: this.cp8(this.e); this.cycles += 4; break;
      case 0xbc: this.cp8(this.h); this.cycles += 4; break;
      case 0xbd: this.cp8(this.l); this.cycles += 4; break;
      case 0xbe: this.cp8(this.read(this.hl)); this.cycles += 7; break;
      case 0xbf: this.cp8(this.a); this.cycles += 4; break;

      // --- Control flow (0xC0-0xFF) ---
      // RET NZ
      case 0xc0: if (!(this.f & FLAG_Z)) { this.pc = this.popWord(); this.cycles += 11; } else { this.cycles += 5; } break;
      // POP BC
      case 0xc1: this.bc = this.popWord(); this.cycles += 10; break;
      // JP NZ,nn
      case 0xc2: { const a = this.fetchWord(); if (!(this.f & FLAG_Z)) this.pc = a; this.cycles += 10; break; }
      // JP nn
      case 0xc3: this.pc = this.fetchWord(); this.cycles += 10; break;
      // CALL NZ,nn
      case 0xc4: { const a = this.fetchWord(); if (!(this.f & FLAG_Z)) { this.pushWord(this.pc); this.pc = a; this.cycles += 17; } else { this.cycles += 10; } break; }
      // PUSH BC
      case 0xc5: this.pushWord(this.bc); this.cycles += 11; break;
      // ADD A,n
      case 0xc6: this.a = this.add8(this.a, this.fetchByte()); this.cycles += 7; break;
      // RST 00
      case 0xc7: this.pushWord(this.pc); this.pc = 0x00; this.cycles += 11; break;
      // RET Z
      case 0xc8: if (this.f & FLAG_Z) { this.pc = this.popWord(); this.cycles += 11; } else { this.cycles += 5; } break;
      // RET
      case 0xc9: this.pc = this.popWord(); this.cycles += 10; break;
      // JP Z,nn
      case 0xca: { const a = this.fetchWord(); if (this.f & FLAG_Z) this.pc = a; this.cycles += 10; break; }
      // CB prefix
      case 0xcb: this.execCB(); break;
      // CALL Z,nn
      case 0xcc: { const a = this.fetchWord(); if (this.f & FLAG_Z) { this.pushWord(this.pc); this.pc = a; this.cycles += 17; } else { this.cycles += 10; } break; }
      // CALL nn
      case 0xcd: { const a = this.fetchWord(); this.pushWord(this.pc); this.pc = a; this.cycles += 17; break; }
      // ADC A,n
      case 0xce: this.a = this.adc8(this.a, this.fetchByte()); this.cycles += 7; break;
      // RST 08
      case 0xcf: this.pushWord(this.pc); this.pc = 0x08; this.cycles += 11; break;

      // RET NC
      case 0xd0: if (!(this.f & FLAG_C)) { this.pc = this.popWord(); this.cycles += 11; } else { this.cycles += 5; } break;
      // POP DE
      case 0xd1: this.de = this.popWord(); this.cycles += 10; break;
      // JP NC,nn
      case 0xd2: { const a = this.fetchWord(); if (!(this.f & FLAG_C)) this.pc = a; this.cycles += 10; break; }
      // OUT (n),A
      case 0xd3: { const port = this.fetchByte(); this.ioWrite((this.a << 8) | port, this.a); this.cycles += 11; break; }
      // CALL NC,nn
      case 0xd4: { const a = this.fetchWord(); if (!(this.f & FLAG_C)) { this.pushWord(this.pc); this.pc = a; this.cycles += 17; } else { this.cycles += 10; } break; }
      // PUSH DE
      case 0xd5: this.pushWord(this.de); this.cycles += 11; break;
      // SUB n
      case 0xd6: this.a = this.sub8(this.a, this.fetchByte()); this.cycles += 7; break;
      // RST 10
      case 0xd7: this.pushWord(this.pc); this.pc = 0x10; this.cycles += 11; break;
      // RET C
      case 0xd8: if (this.f & FLAG_C) { this.pc = this.popWord(); this.cycles += 11; } else { this.cycles += 5; } break;
      // EXX
      case 0xd9: {
        let t: number;
        t = this.b; this.b = this.b_; this.b_ = t;
        t = this.c; this.c = this.c_; this.c_ = t;
        t = this.d; this.d = this.d_; this.d_ = t;
        t = this.e; this.e = this.e_; this.e_ = t;
        t = this.h; this.h = this.h_; this.h_ = t;
        t = this.l; this.l = this.l_; this.l_ = t;
        this.cycles += 4;
        break;
      }
      // JP C,nn
      case 0xda: { const a = this.fetchWord(); if (this.f & FLAG_C) this.pc = a; this.cycles += 10; break; }
      // IN A,(n)
      case 0xdb: { const port = this.fetchByte(); this.a = this.ioRead((this.a << 8) | port); this.cycles += 11; break; }
      // CALL C,nn
      case 0xdc: { const a = this.fetchWord(); if (this.f & FLAG_C) { this.pushWord(this.pc); this.pc = a; this.cycles += 17; } else { this.cycles += 10; } break; }
      // DD prefix (IX)
      case 0xdd: this.execDD(); break;
      // SBC A,n
      case 0xde: this.a = this.sbc8(this.a, this.fetchByte()); this.cycles += 7; break;
      // RST 18
      case 0xdf: this.pushWord(this.pc); this.pc = 0x18; this.cycles += 11; break;

      // RET PO
      case 0xe0: if (!(this.f & FLAG_PV)) { this.pc = this.popWord(); this.cycles += 11; } else { this.cycles += 5; } break;
      // POP HL
      case 0xe1: this.hl = this.popWord(); this.cycles += 10; break;
      // JP PO,nn
      case 0xe2: { const a = this.fetchWord(); if (!(this.f & FLAG_PV)) this.pc = a; this.cycles += 10; break; }
      // EX (SP),HL
      case 0xe3: {
        const lo = this.read(this.sp);
        const hi = this.read((this.sp + 1) & 0xffff);
        this.write(this.sp, this.l);
        this.write((this.sp + 1) & 0xffff, this.h);
        this.l = lo; this.h = hi;
        this.cycles += 19;
        break;
      }
      // CALL PO,nn
      case 0xe4: { const a = this.fetchWord(); if (!(this.f & FLAG_PV)) { this.pushWord(this.pc); this.pc = a; this.cycles += 17; } else { this.cycles += 10; } break; }
      // PUSH HL
      case 0xe5: this.pushWord(this.hl); this.cycles += 11; break;
      // AND n
      case 0xe6: this.and8(this.fetchByte()); this.cycles += 7; break;
      // RST 20
      case 0xe7: this.pushWord(this.pc); this.pc = 0x20; this.cycles += 11; break;
      // RET PE
      case 0xe8: if (this.f & FLAG_PV) { this.pc = this.popWord(); this.cycles += 11; } else { this.cycles += 5; } break;
      // JP (HL)
      case 0xe9: this.pc = this.hl; this.cycles += 4; break;
      // JP PE,nn
      case 0xea: { const a = this.fetchWord(); if (this.f & FLAG_PV) this.pc = a; this.cycles += 10; break; }
      // EX DE,HL
      case 0xeb: { const t = this.de; this.de = this.hl; this.hl = t; this.cycles += 4; break; }
      // CALL PE,nn
      case 0xec: { const a = this.fetchWord(); if (this.f & FLAG_PV) { this.pushWord(this.pc); this.pc = a; this.cycles += 17; } else { this.cycles += 10; } break; }
      // ED prefix
      case 0xed: this.execED(); break;
      // XOR n
      case 0xee: this.xor8(this.fetchByte()); this.cycles += 7; break;
      // RST 28
      case 0xef: this.pushWord(this.pc); this.pc = 0x28; this.cycles += 11; break;

      // RET P (positive, sign flag clear)
      case 0xf0: if (!(this.f & FLAG_S)) { this.pc = this.popWord(); this.cycles += 11; } else { this.cycles += 5; } break;
      // POP AF
      case 0xf1: this.af = this.popWord(); this.cycles += 10; break;
      // JP P,nn
      case 0xf2: { const a = this.fetchWord(); if (!(this.f & FLAG_S)) this.pc = a; this.cycles += 10; break; }
      // DI
      case 0xf3: this.iff1 = this.iff2 = false; this.cycles += 4; break;
      // CALL P,nn
      case 0xf4: { const a = this.fetchWord(); if (!(this.f & FLAG_S)) { this.pushWord(this.pc); this.pc = a; this.cycles += 17; } else { this.cycles += 10; } break; }
      // PUSH AF
      case 0xf5: this.pushWord(this.af); this.cycles += 11; break;
      // OR n
      case 0xf6: this.or8(this.fetchByte()); this.cycles += 7; break;
      // RST 30
      case 0xf7: this.pushWord(this.pc); this.pc = 0x30; this.cycles += 11; break;
      // RET M (minus, sign flag set)
      case 0xf8: if (this.f & FLAG_S) { this.pc = this.popWord(); this.cycles += 11; } else { this.cycles += 5; } break;
      // LD SP,HL
      case 0xf9: this.sp = this.hl; this.cycles += 6; break;
      // JP M,nn
      case 0xfa: { const a = this.fetchWord(); if (this.f & FLAG_S) this.pc = a; this.cycles += 10; break; }
      // EI
      case 0xfb: this.eiPending = true; this.cycles += 4; break;
      // CALL M,nn
      case 0xfc: { const a = this.fetchWord(); if (this.f & FLAG_S) { this.pushWord(this.pc); this.pc = a; this.cycles += 17; } else { this.cycles += 10; } break; }
      // FD prefix (IY)
      case 0xfd: this.execFD(); break;
      // CP n
      case 0xfe: this.cp8(this.fetchByte()); this.cycles += 7; break;
      // RST 38
      case 0xff: this.pushWord(this.pc); this.pc = 0x38; this.cycles += 11; break;

      default: this.cycles += 4; break; // Treat unknown as NOP
    }
  }

  // --- CB prefix: bit/rotate/shift operations ---
  private execCB(): void {
    const op = this.fetchByte();
    const reg = op & 0x07;
    const operation = op >> 3;

    // Get value from register or (HL)
    let value = this.getReg8(reg);
    if (reg === 6) this.cycles += 4; // (HL) access penalty

    switch (operation) {
      case 0: value = this.rlc(value); break;    // RLC
      case 1: value = this.rrc(value); break;    // RRC
      case 2: value = this.rl(value); break;     // RL
      case 3: value = this.rr(value); break;     // RR
      case 4: value = this.sla(value); break;    // SLA
      case 5: value = this.sra(value); break;    // SRA
      case 6: value = this.sll(value); break; // SLL (undocumented) — treat as SLA with bit 0 set
      case 7: value = this.srl(value); break;    // SRL
      default: {
        // BIT, RES, SET operations
        const bitNum = (operation - 8) & 7;
        const group = operation >> 3;
        if (group === 1) {
          // BIT n,r
          this.bit(bitNum, value);
          this.cycles += 8;
          return;
        } else if (group === 2) {
          // RES n,r
          value &= ~(1 << bitNum);
        } else {
          // SET n,r
          value |= (1 << bitNum);
        }
      }
    }

    if (operation < 8) {
      // Rotate/shift: write back
      this.setReg8(reg, value);
      this.cycles += 8;
    } else {
      // RES/SET: write back
      this.setReg8(reg, value);
      this.cycles += 8;
    }
  }

  // --- DD prefix: IX operations ---
  private execDD(): void {
    const op = this.fetchByte();
    this.r = (this.r & 0x80) | ((this.r + 1) & 0x7f);

    switch (op) {
      // ADD IX,rr
      case 0x09: this.ix = this.addIX(this.bc); this.cycles += 15; break;
      case 0x19: this.ix = this.addIX(this.de); this.cycles += 15; break;
      case 0x29: this.ix = this.addIX(this.ix); this.cycles += 15; break;
      case 0x39: this.ix = this.addIX(this.sp); this.cycles += 15; break;

      // LD IX,nn
      case 0x21: this.ix = this.fetchWord(); this.cycles += 14; break;
      // LD (nn),IX
      case 0x22: { const a = this.fetchWord(); this.write16(a, this.ix); this.cycles += 20; break; }
      // INC IX
      case 0x23: this.ix = (this.ix + 1) & 0xffff; this.cycles += 10; break;
      // INC IXH
      case 0x24: this.ix = (this.inc8((this.ix >> 8) & 0xff) << 8) | (this.ix & 0xff); this.cycles += 8; break;
      // DEC IXH
      case 0x25: this.ix = (this.dec8((this.ix >> 8) & 0xff) << 8) | (this.ix & 0xff); this.cycles += 8; break;
      // LD IXH,n
      case 0x26: this.ix = (this.fetchByte() << 8) | (this.ix & 0xff); this.cycles += 11; break;
      // LD IX,(nn)
      case 0x2a: { const a = this.fetchWord(); this.ix = this.read16(a); this.cycles += 20; break; }
      // DEC IX
      case 0x2b: this.ix = (this.ix - 1) & 0xffff; this.cycles += 10; break;
      // INC IXL
      case 0x2c: this.ix = (this.ix & 0xff00) | this.inc8(this.ix & 0xff); this.cycles += 8; break;
      // DEC IXL
      case 0x2d: this.ix = (this.ix & 0xff00) | this.dec8(this.ix & 0xff); this.cycles += 8; break;
      // LD IXL,n
      case 0x2e: this.ix = (this.ix & 0xff00) | this.fetchByte(); this.cycles += 11; break;

      // INC (IX+d)
      case 0x34: { const d = this.fetchDisplacement(); const a = (this.ix + d) & 0xffff; this.write(a, this.inc8(this.read(a))); this.cycles += 23; break; }
      // DEC (IX+d)
      case 0x35: { const d = this.fetchDisplacement(); const a = (this.ix + d) & 0xffff; this.write(a, this.dec8(this.read(a))); this.cycles += 23; break; }
      // LD (IX+d),n
      case 0x36: { const d = this.fetchDisplacement(); const n = this.fetchByte(); this.write((this.ix + d) & 0xffff, n); this.cycles += 19; break; }

      // LD r,IXH
      case 0x44: this.b = (this.ix >> 8) & 0xff; this.cycles += 8; break;
      case 0x4c: this.c = (this.ix >> 8) & 0xff; this.cycles += 8; break;
      case 0x54: this.d = (this.ix >> 8) & 0xff; this.cycles += 8; break;
      case 0x5c: this.e = (this.ix >> 8) & 0xff; this.cycles += 8; break;
      case 0x7c: this.a = (this.ix >> 8) & 0xff; this.cycles += 8; break;
      // LD r,IXL
      case 0x45: this.b = this.ix & 0xff; this.cycles += 8; break;
      case 0x4d: this.c = this.ix & 0xff; this.cycles += 8; break;
      case 0x55: this.d = this.ix & 0xff; this.cycles += 8; break;
      case 0x5d: this.e = this.ix & 0xff; this.cycles += 8; break;
      case 0x7d: this.a = this.ix & 0xff; this.cycles += 8; break;

      // LD r,(IX+d) — 0x46,0x4E,0x56,0x5E,0x66,0x6E,0x7E
      case 0x46: { const d = this.fetchDisplacement(); this.b = this.read((this.ix + d) & 0xffff); this.cycles += 19; break; }
      case 0x4e: { const d = this.fetchDisplacement(); this.c = this.read((this.ix + d) & 0xffff); this.cycles += 19; break; }
      case 0x56: { const d = this.fetchDisplacement(); this.d = this.read((this.ix + d) & 0xffff); this.cycles += 19; break; }
      case 0x5e: { const d = this.fetchDisplacement(); this.e = this.read((this.ix + d) & 0xffff); this.cycles += 19; break; }
      case 0x66: { const d = this.fetchDisplacement(); this.h = this.read((this.ix + d) & 0xffff); this.cycles += 19; break; }
      case 0x6e: { const d = this.fetchDisplacement(); this.l = this.read((this.ix + d) & 0xffff); this.cycles += 19; break; }
      case 0x7e: { const d = this.fetchDisplacement(); this.a = this.read((this.ix + d) & 0xffff); this.cycles += 19; break; }

      // LD IXH,r
      case 0x60: this.ix = (this.b << 8) | (this.ix & 0xff); this.cycles += 8; break;
      case 0x61: this.ix = (this.c << 8) | (this.ix & 0xff); this.cycles += 8; break;
      case 0x62: this.ix = (this.d << 8) | (this.ix & 0xff); this.cycles += 8; break;
      case 0x63: this.ix = (this.e << 8) | (this.ix & 0xff); this.cycles += 8; break;
      case 0x64: this.cycles += 8; break; // LD IXH,IXH (nop)
      case 0x65: this.ix = ((this.ix & 0xff) << 8) | (this.ix & 0xff); this.cycles += 8; break; // LD IXH,IXL
      case 0x67: this.ix = (this.a << 8) | (this.ix & 0xff); this.cycles += 8; break;

      // LD IXL,r
      case 0x68: this.ix = (this.ix & 0xff00) | this.b; this.cycles += 8; break;
      case 0x69: this.ix = (this.ix & 0xff00) | this.c; this.cycles += 8; break;
      case 0x6a: this.ix = (this.ix & 0xff00) | this.d; this.cycles += 8; break;
      case 0x6b: this.ix = (this.ix & 0xff00) | this.e; this.cycles += 8; break;
      case 0x6c: this.ix = (this.ix & 0xff00) | ((this.ix >> 8) & 0xff); this.cycles += 8; break; // LD IXL,IXH
      case 0x6d: this.cycles += 8; break; // LD IXL,IXL (nop)
      case 0x6f: this.ix = (this.ix & 0xff00) | this.a; this.cycles += 8; break;

      // LD (IX+d),r — 0x70-0x77
      case 0x70: { const d = this.fetchDisplacement(); this.write((this.ix + d) & 0xffff, this.b); this.cycles += 19; break; }
      case 0x71: { const d = this.fetchDisplacement(); this.write((this.ix + d) & 0xffff, this.c); this.cycles += 19; break; }
      case 0x72: { const d = this.fetchDisplacement(); this.write((this.ix + d) & 0xffff, this.d); this.cycles += 19; break; }
      case 0x73: { const d = this.fetchDisplacement(); this.write((this.ix + d) & 0xffff, this.e); this.cycles += 19; break; }
      case 0x74: { const d = this.fetchDisplacement(); this.write((this.ix + d) & 0xffff, this.h); this.cycles += 19; break; }
      case 0x75: { const d = this.fetchDisplacement(); this.write((this.ix + d) & 0xffff, this.l); this.cycles += 19; break; }
      case 0x77: { const d = this.fetchDisplacement(); this.write((this.ix + d) & 0xffff, this.a); this.cycles += 19; break; }

      // ALU A,IXH
      case 0x84: this.a = this.add8(this.a, (this.ix >> 8) & 0xff); this.cycles += 8; break;
      case 0x8c: this.a = this.adc8(this.a, (this.ix >> 8) & 0xff); this.cycles += 8; break;
      case 0x94: this.a = this.sub8(this.a, (this.ix >> 8) & 0xff); this.cycles += 8; break;
      case 0x9c: this.a = this.sbc8(this.a, (this.ix >> 8) & 0xff); this.cycles += 8; break;
      case 0xa4: this.and8((this.ix >> 8) & 0xff); this.cycles += 8; break;
      case 0xac: this.xor8((this.ix >> 8) & 0xff); this.cycles += 8; break;
      case 0xb4: this.or8((this.ix >> 8) & 0xff); this.cycles += 8; break;
      case 0xbc: this.cp8((this.ix >> 8) & 0xff); this.cycles += 8; break;

      // ALU A,IXL
      case 0x85: this.a = this.add8(this.a, this.ix & 0xff); this.cycles += 8; break;
      case 0x8d: this.a = this.adc8(this.a, this.ix & 0xff); this.cycles += 8; break;
      case 0x95: this.a = this.sub8(this.a, this.ix & 0xff); this.cycles += 8; break;
      case 0x9d: this.a = this.sbc8(this.a, this.ix & 0xff); this.cycles += 8; break;
      case 0xa5: this.and8(this.ix & 0xff); this.cycles += 8; break;
      case 0xad: this.xor8(this.ix & 0xff); this.cycles += 8; break;
      case 0xb5: this.or8(this.ix & 0xff); this.cycles += 8; break;
      case 0xbd: this.cp8(this.ix & 0xff); this.cycles += 8; break;

      // ALU A,(IX+d)
      case 0x86: { const d = this.fetchDisplacement(); this.a = this.add8(this.a, this.read((this.ix + d) & 0xffff)); this.cycles += 19; break; }
      case 0x8e: { const d = this.fetchDisplacement(); this.a = this.adc8(this.a, this.read((this.ix + d) & 0xffff)); this.cycles += 19; break; }
      case 0x96: { const d = this.fetchDisplacement(); this.a = this.sub8(this.a, this.read((this.ix + d) & 0xffff)); this.cycles += 19; break; }
      case 0x9e: { const d = this.fetchDisplacement(); this.a = this.sbc8(this.a, this.read((this.ix + d) & 0xffff)); this.cycles += 19; break; }
      case 0xa6: { const d = this.fetchDisplacement(); this.and8(this.read((this.ix + d) & 0xffff)); this.cycles += 19; break; }
      case 0xae: { const d = this.fetchDisplacement(); this.xor8(this.read((this.ix + d) & 0xffff)); this.cycles += 19; break; }
      case 0xb6: { const d = this.fetchDisplacement(); this.or8(this.read((this.ix + d) & 0xffff)); this.cycles += 19; break; }
      case 0xbe: { const d = this.fetchDisplacement(); this.cp8(this.read((this.ix + d) & 0xffff)); this.cycles += 19; break; }

      // DDCB — indexed bit operations
      case 0xcb: this.execDDCB(); break;

      // POP IX
      case 0xe1: this.ix = this.popWord(); this.cycles += 14; break;
      // EX (SP),IX
      case 0xe3: {
        const lo = this.read(this.sp);
        const hi = this.read((this.sp + 1) & 0xffff);
        this.write(this.sp, this.ix & 0xff);
        this.write((this.sp + 1) & 0xffff, (this.ix >> 8) & 0xff);
        this.ix = (hi << 8) | lo;
        this.cycles += 23;
        break;
      }
      // PUSH IX
      case 0xe5: this.pushWord(this.ix); this.cycles += 15; break;
      // JP (IX)
      case 0xe9: this.pc = this.ix; this.cycles += 8; break;
      // LD SP,IX
      case 0xf9: this.sp = this.ix; this.cycles += 10; break;

      default:
        // Unknown DD-prefixed instruction: treat as unprefixed
        this.execMain(op);
        break;
    }
  }

  // --- FD prefix: IY operations (mirrors DD with IY) ---
  private execFD(): void {
    const op = this.fetchByte();
    this.r = (this.r & 0x80) | ((this.r + 1) & 0x7f);

    switch (op) {
      case 0x09: this.iy = this.addIY(this.bc); this.cycles += 15; break;
      case 0x19: this.iy = this.addIY(this.de); this.cycles += 15; break;
      case 0x29: this.iy = this.addIY(this.iy); this.cycles += 15; break;
      case 0x39: this.iy = this.addIY(this.sp); this.cycles += 15; break;

      case 0x21: this.iy = this.fetchWord(); this.cycles += 14; break;
      case 0x22: { const a = this.fetchWord(); this.write16(a, this.iy); this.cycles += 20; break; }
      case 0x23: this.iy = (this.iy + 1) & 0xffff; this.cycles += 10; break;
      // INC IYH
      case 0x24: this.iy = (this.inc8((this.iy >> 8) & 0xff) << 8) | (this.iy & 0xff); this.cycles += 8; break;
      // DEC IYH
      case 0x25: this.iy = (this.dec8((this.iy >> 8) & 0xff) << 8) | (this.iy & 0xff); this.cycles += 8; break;
      // LD IYH,n
      case 0x26: this.iy = (this.fetchByte() << 8) | (this.iy & 0xff); this.cycles += 11; break;
      case 0x2a: { const a = this.fetchWord(); this.iy = this.read16(a); this.cycles += 20; break; }
      case 0x2b: this.iy = (this.iy - 1) & 0xffff; this.cycles += 10; break;
      // INC IYL
      case 0x2c: this.iy = (this.iy & 0xff00) | this.inc8(this.iy & 0xff); this.cycles += 8; break;
      // DEC IYL
      case 0x2d: this.iy = (this.iy & 0xff00) | this.dec8(this.iy & 0xff); this.cycles += 8; break;
      // LD IYL,n
      case 0x2e: this.iy = (this.iy & 0xff00) | this.fetchByte(); this.cycles += 11; break;

      case 0x34: { const d = this.fetchDisplacement(); const a = (this.iy + d) & 0xffff; this.write(a, this.inc8(this.read(a))); this.cycles += 23; break; }
      case 0x35: { const d = this.fetchDisplacement(); const a = (this.iy + d) & 0xffff; this.write(a, this.dec8(this.read(a))); this.cycles += 23; break; }
      case 0x36: { const d = this.fetchDisplacement(); const n = this.fetchByte(); this.write((this.iy + d) & 0xffff, n); this.cycles += 19; break; }

      // LD r,IYH
      case 0x44: this.b = (this.iy >> 8) & 0xff; this.cycles += 8; break;
      case 0x4c: this.c = (this.iy >> 8) & 0xff; this.cycles += 8; break;
      case 0x54: this.d = (this.iy >> 8) & 0xff; this.cycles += 8; break;
      case 0x5c: this.e = (this.iy >> 8) & 0xff; this.cycles += 8; break;
      case 0x7c: this.a = (this.iy >> 8) & 0xff; this.cycles += 8; break;
      // LD r,IYL
      case 0x45: this.b = this.iy & 0xff; this.cycles += 8; break;
      case 0x4d: this.c = this.iy & 0xff; this.cycles += 8; break;
      case 0x55: this.d = this.iy & 0xff; this.cycles += 8; break;
      case 0x5d: this.e = this.iy & 0xff; this.cycles += 8; break;
      case 0x7d: this.a = this.iy & 0xff; this.cycles += 8; break;

      // LD r,(IY+d)
      case 0x46: { const d = this.fetchDisplacement(); this.b = this.read((this.iy + d) & 0xffff); this.cycles += 19; break; }
      case 0x4e: { const d = this.fetchDisplacement(); this.c = this.read((this.iy + d) & 0xffff); this.cycles += 19; break; }
      case 0x56: { const d = this.fetchDisplacement(); this.d = this.read((this.iy + d) & 0xffff); this.cycles += 19; break; }
      case 0x5e: { const d = this.fetchDisplacement(); this.e = this.read((this.iy + d) & 0xffff); this.cycles += 19; break; }
      case 0x66: { const d = this.fetchDisplacement(); this.h = this.read((this.iy + d) & 0xffff); this.cycles += 19; break; }
      case 0x6e: { const d = this.fetchDisplacement(); this.l = this.read((this.iy + d) & 0xffff); this.cycles += 19; break; }
      case 0x7e: { const d = this.fetchDisplacement(); this.a = this.read((this.iy + d) & 0xffff); this.cycles += 19; break; }

      // LD IYH,r
      case 0x60: this.iy = (this.b << 8) | (this.iy & 0xff); this.cycles += 8; break;
      case 0x61: this.iy = (this.c << 8) | (this.iy & 0xff); this.cycles += 8; break;
      case 0x62: this.iy = (this.d << 8) | (this.iy & 0xff); this.cycles += 8; break;
      case 0x63: this.iy = (this.e << 8) | (this.iy & 0xff); this.cycles += 8; break;
      case 0x64: this.cycles += 8; break; // LD IYH,IYH (nop)
      case 0x65: this.iy = ((this.iy & 0xff) << 8) | (this.iy & 0xff); this.cycles += 8; break; // LD IYH,IYL
      case 0x67: this.iy = (this.a << 8) | (this.iy & 0xff); this.cycles += 8; break;

      // LD IYL,r
      case 0x68: this.iy = (this.iy & 0xff00) | this.b; this.cycles += 8; break;
      case 0x69: this.iy = (this.iy & 0xff00) | this.c; this.cycles += 8; break;
      case 0x6a: this.iy = (this.iy & 0xff00) | this.d; this.cycles += 8; break;
      case 0x6b: this.iy = (this.iy & 0xff00) | this.e; this.cycles += 8; break;
      case 0x6c: this.iy = (this.iy & 0xff00) | ((this.iy >> 8) & 0xff); this.cycles += 8; break; // LD IYL,IYH
      case 0x6d: this.cycles += 8; break; // LD IYL,IYL (nop)
      case 0x6f: this.iy = (this.iy & 0xff00) | this.a; this.cycles += 8; break;

      // LD (IY+d),r
      case 0x70: { const d = this.fetchDisplacement(); this.write((this.iy + d) & 0xffff, this.b); this.cycles += 19; break; }
      case 0x71: { const d = this.fetchDisplacement(); this.write((this.iy + d) & 0xffff, this.c); this.cycles += 19; break; }
      case 0x72: { const d = this.fetchDisplacement(); this.write((this.iy + d) & 0xffff, this.d); this.cycles += 19; break; }
      case 0x73: { const d = this.fetchDisplacement(); this.write((this.iy + d) & 0xffff, this.e); this.cycles += 19; break; }
      case 0x74: { const d = this.fetchDisplacement(); this.write((this.iy + d) & 0xffff, this.h); this.cycles += 19; break; }
      case 0x75: { const d = this.fetchDisplacement(); this.write((this.iy + d) & 0xffff, this.l); this.cycles += 19; break; }
      case 0x77: { const d = this.fetchDisplacement(); this.write((this.iy + d) & 0xffff, this.a); this.cycles += 19; break; }

      // ALU A,IYH
      case 0x84: this.a = this.add8(this.a, (this.iy >> 8) & 0xff); this.cycles += 8; break;
      case 0x8c: this.a = this.adc8(this.a, (this.iy >> 8) & 0xff); this.cycles += 8; break;
      case 0x94: this.a = this.sub8(this.a, (this.iy >> 8) & 0xff); this.cycles += 8; break;
      case 0x9c: this.a = this.sbc8(this.a, (this.iy >> 8) & 0xff); this.cycles += 8; break;
      case 0xa4: this.and8((this.iy >> 8) & 0xff); this.cycles += 8; break;
      case 0xac: this.xor8((this.iy >> 8) & 0xff); this.cycles += 8; break;
      case 0xb4: this.or8((this.iy >> 8) & 0xff); this.cycles += 8; break;
      case 0xbc: this.cp8((this.iy >> 8) & 0xff); this.cycles += 8; break;

      // ALU A,IYL
      case 0x85: this.a = this.add8(this.a, this.iy & 0xff); this.cycles += 8; break;
      case 0x8d: this.a = this.adc8(this.a, this.iy & 0xff); this.cycles += 8; break;
      case 0x95: this.a = this.sub8(this.a, this.iy & 0xff); this.cycles += 8; break;
      case 0x9d: this.a = this.sbc8(this.a, this.iy & 0xff); this.cycles += 8; break;
      case 0xa5: this.and8(this.iy & 0xff); this.cycles += 8; break;
      case 0xad: this.xor8(this.iy & 0xff); this.cycles += 8; break;
      case 0xb5: this.or8(this.iy & 0xff); this.cycles += 8; break;
      case 0xbd: this.cp8(this.iy & 0xff); this.cycles += 8; break;

      // ALU A,(IY+d)
      case 0x86: { const d = this.fetchDisplacement(); this.a = this.add8(this.a, this.read((this.iy + d) & 0xffff)); this.cycles += 19; break; }
      case 0x8e: { const d = this.fetchDisplacement(); this.a = this.adc8(this.a, this.read((this.iy + d) & 0xffff)); this.cycles += 19; break; }
      case 0x96: { const d = this.fetchDisplacement(); this.a = this.sub8(this.a, this.read((this.iy + d) & 0xffff)); this.cycles += 19; break; }
      case 0x9e: { const d = this.fetchDisplacement(); this.a = this.sbc8(this.a, this.read((this.iy + d) & 0xffff)); this.cycles += 19; break; }
      case 0xa6: { const d = this.fetchDisplacement(); this.and8(this.read((this.iy + d) & 0xffff)); this.cycles += 19; break; }
      case 0xae: { const d = this.fetchDisplacement(); this.xor8(this.read((this.iy + d) & 0xffff)); this.cycles += 19; break; }
      case 0xb6: { const d = this.fetchDisplacement(); this.or8(this.read((this.iy + d) & 0xffff)); this.cycles += 19; break; }
      case 0xbe: { const d = this.fetchDisplacement(); this.cp8(this.read((this.iy + d) & 0xffff)); this.cycles += 19; break; }

      case 0xcb: this.execFDCB(); break;

      case 0xe1: this.iy = this.popWord(); this.cycles += 14; break;
      case 0xe3: {
        const lo = this.read(this.sp);
        const hi = this.read((this.sp + 1) & 0xffff);
        this.write(this.sp, this.iy & 0xff);
        this.write((this.sp + 1) & 0xffff, (this.iy >> 8) & 0xff);
        this.iy = (hi << 8) | lo;
        this.cycles += 23;
        break;
      }
      case 0xe5: this.pushWord(this.iy); this.cycles += 15; break;
      case 0xe9: this.pc = this.iy; this.cycles += 8; break;
      case 0xf9: this.sp = this.iy; this.cycles += 10; break;

      default:
        this.execMain(op);
        break;
    }
  }

  // --- ED prefix: extended instructions ---
  private execED(): void {
    const op = this.fetchByte();
    this.r = (this.r & 0x80) | ((this.r + 1) & 0x7f);

    switch (op) {
      // IN r,(C) — 0x40,0x48,0x50,0x58,0x60,0x68,0x78
      case 0x40: this.b = this.inC(); this.cycles += 12; break;
      case 0x48: this.c = this.inC(); this.cycles += 12; break;
      case 0x50: this.d = this.inC(); this.cycles += 12; break;
      case 0x58: this.e = this.inC(); this.cycles += 12; break;
      case 0x60: this.h = this.inC(); this.cycles += 12; break;
      case 0x68: this.l = this.inC(); this.cycles += 12; break;
      case 0x70: this.inC(); this.cycles += 12; break; // IN (C) - flags only
      case 0x78: this.a = this.inC(); this.cycles += 12; break;

      // OUT (C),r — 0x41,0x49,0x51,0x59,0x61,0x69,0x79
      case 0x41: this.ioWrite(this.bc, this.b); this.cycles += 12; break;
      case 0x49: this.ioWrite(this.bc, this.c); this.cycles += 12; break;
      case 0x51: this.ioWrite(this.bc, this.d); this.cycles += 12; break;
      case 0x59: this.ioWrite(this.bc, this.e); this.cycles += 12; break;
      case 0x61: this.ioWrite(this.bc, this.h); this.cycles += 12; break;
      case 0x69: this.ioWrite(this.bc, this.l); this.cycles += 12; break;
      case 0x71: this.ioWrite(this.bc, 0); this.cycles += 12; break; // OUT (C),0
      case 0x79: this.ioWrite(this.bc, this.a); this.cycles += 12; break;

      // SBC HL,rr
      case 0x42: this.sbcHL(this.bc); this.cycles += 15; break;
      case 0x52: this.sbcHL(this.de); this.cycles += 15; break;
      case 0x62: this.sbcHL(this.hl); this.cycles += 15; break;
      case 0x72: this.sbcHL(this.sp); this.cycles += 15; break;

      // ADC HL,rr
      case 0x4a: this.adcHL(this.bc); this.cycles += 15; break;
      case 0x5a: this.adcHL(this.de); this.cycles += 15; break;
      case 0x6a: this.adcHL(this.hl); this.cycles += 15; break;
      case 0x7a: this.adcHL(this.sp); this.cycles += 15; break;

      // LD (nn),rr
      case 0x43: { const a = this.fetchWord(); this.write16(a, this.bc); this.cycles += 20; break; }
      case 0x53: { const a = this.fetchWord(); this.write16(a, this.de); this.cycles += 20; break; }
      case 0x63: { const a = this.fetchWord(); this.write16(a, this.hl); this.cycles += 20; break; }
      case 0x73: { const a = this.fetchWord(); this.write16(a, this.sp); this.cycles += 20; break; }

      // LD rr,(nn)
      case 0x4b: { const a = this.fetchWord(); this.bc = this.read16(a); this.cycles += 20; break; }
      case 0x5b: { const a = this.fetchWord(); this.de = this.read16(a); this.cycles += 20; break; }
      case 0x6b: { const a = this.fetchWord(); this.hl = this.read16(a); this.cycles += 20; break; }
      case 0x7b: { const a = this.fetchWord(); this.sp = this.read16(a); this.cycles += 20; break; }

      // NEG
      case 0x44: case 0x4c: case 0x54: case 0x5c:
      case 0x64: case 0x6c: case 0x74: case 0x7c: {
        const old = this.a;
        this.a = this.sub8(0, old);
        this.cycles += 8;
        break;
      }

      // RETN
      case 0x45: case 0x55: case 0x65: case 0x75:
        this.iff1 = this.iff2;
        this.pc = this.popWord();
        this.cycles += 14;
        break;

      // RETI
      case 0x4d: case 0x5d: case 0x6d: case 0x7d:
        this.iff1 = this.iff2;
        this.pc = this.popWord();
        this.cycles += 14;
        break;

      // IM 0/1/2
      case 0x46: case 0x66: this.im = 0; this.cycles += 8; break;
      case 0x56: case 0x76: this.im = 1; this.cycles += 8; break;
      case 0x5e: case 0x7e: this.im = 2; this.cycles += 8; break;

      // LD I,A
      case 0x47: this.i = this.a; this.cycles += 9; break;
      // LD R,A
      case 0x4f: this.r = this.a; this.cycles += 9; break;
      // LD A,I
      case 0x57:
        this.a = this.i;
        this.f = (this.f & FLAG_C) | SZ_TABLE[this.a] | (this.iff2 ? FLAG_PV : 0);
        this.cycles += 9;
        break;
      // LD A,R
      case 0x5f:
        this.a = this.r;
        this.f = (this.f & FLAG_C) | SZ_TABLE[this.a] | (this.iff2 ? FLAG_PV : 0);
        this.cycles += 9;
        break;

      // RRD
      case 0x67: {
        const m = this.read(this.hl);
        const newM = ((this.a & 0x0f) << 4) | (m >> 4);
        this.a = (this.a & 0xf0) | (m & 0x0f);
        this.write(this.hl, newM);
        this.f = (this.f & FLAG_C) | SZ_TABLE[this.a] | PARITY_TABLE[this.a];
        this.cycles += 18;
        break;
      }
      // RLD
      case 0x6f: {
        const m = this.read(this.hl);
        const newM = ((m & 0x0f) << 4) | (this.a & 0x0f);
        this.a = (this.a & 0xf0) | ((m >> 4) & 0x0f);
        this.write(this.hl, newM);
        this.f = (this.f & FLAG_C) | SZ_TABLE[this.a] | PARITY_TABLE[this.a];
        this.cycles += 18;
        break;
      }

      // Block transfer/search/I/O
      // LDI
      case 0xa0: this.ldi(); this.cycles += 16; break;
      // CPI
      case 0xa1: this.cpi(); this.cycles += 16; break;
      // INI
      case 0xa2: this.ini(); this.cycles += 16; break;
      // OUTI
      case 0xa3: this.outi(); this.cycles += 16; break;
      // LDD
      case 0xa8: this.ldd(); this.cycles += 16; break;
      // CPD
      case 0xa9: this.cpd(); this.cycles += 16; break;
      // IND
      case 0xaa: this.ind(); this.cycles += 16; break;
      // OUTD
      case 0xab: this.outd(); this.cycles += 16; break;

      // LDIR
      case 0xb0: this.ldi(); if (this.bc !== 0) { this.pc = (this.pc - 2) & 0xffff; this.cycles += 21; } else { this.cycles += 16; } break;
      // CPIR
      case 0xb1: this.cpi(); if (this.bc !== 0 && !(this.f & FLAG_Z)) { this.pc = (this.pc - 2) & 0xffff; this.cycles += 21; } else { this.cycles += 16; } break;
      // INIR
      case 0xb2: this.ini(); if (this.b !== 0) { this.pc = (this.pc - 2) & 0xffff; this.cycles += 21; } else { this.cycles += 16; } break;
      // OTIR
      case 0xb3: this.outi(); if (this.b !== 0) { this.pc = (this.pc - 2) & 0xffff; this.cycles += 21; } else { this.cycles += 16; } break;
      // LDDR
      case 0xb8: this.ldd(); if (this.bc !== 0) { this.pc = (this.pc - 2) & 0xffff; this.cycles += 21; } else { this.cycles += 16; } break;
      // CPDR
      case 0xb9: this.cpd(); if (this.bc !== 0 && !(this.f & FLAG_Z)) { this.pc = (this.pc - 2) & 0xffff; this.cycles += 21; } else { this.cycles += 16; } break;
      // INDR
      case 0xba: this.ind(); if (this.b !== 0) { this.pc = (this.pc - 2) & 0xffff; this.cycles += 21; } else { this.cycles += 16; } break;
      // OTDR
      case 0xbb: this.outd(); if (this.b !== 0) { this.pc = (this.pc - 2) & 0xffff; this.cycles += 21; } else { this.cycles += 16; } break;

      default:
        // Unknown ED instruction: NOP (8 cycles for prefix + op)
        this.cycles += 8;
        break;
    }
  }

  // --- DDCB: indexed bit operations on (IX+d) ---
  private execDDCB(): void {
    const d = this.fetchDisplacement();
    const op = this.fetchByte();
    const addr = (this.ix + d) & 0xffff;
    let value = this.read(addr);

    const operation = op >> 3;
    if (operation < 8) {
      // Rotate/shift
      switch (operation) {
        case 0: value = this.rlc(value); break;
        case 1: value = this.rrc(value); break;
        case 2: value = this.rl(value); break;
        case 3: value = this.rr(value); break;
        case 4: value = this.sla(value); break;
        case 5: value = this.sra(value); break;
        case 6: value = this.sll(value); break; // SLL undocumented
        case 7: value = this.srl(value); break;
      }
      this.write(addr, value);
      this.cycles += 23;
    } else {
      const bitNum = (operation - 8) & 7;
      const group = operation >> 3;
      if (group === 1) {
        // BIT n,(IX+d)
        this.bit(bitNum, value);
        this.cycles += 20;
      } else if (group === 2) {
        // RES n,(IX+d)
        this.write(addr, value & ~(1 << bitNum));
        this.cycles += 23;
      } else {
        // SET n,(IX+d)
        this.write(addr, value | (1 << bitNum));
        this.cycles += 23;
      }
    }
  }

  // --- FDCB: indexed bit operations on (IY+d) ---
  private execFDCB(): void {
    const d = this.fetchDisplacement();
    const op = this.fetchByte();
    const addr = (this.iy + d) & 0xffff;
    let value = this.read(addr);

    const operation = op >> 3;
    if (operation < 8) {
      switch (operation) {
        case 0: value = this.rlc(value); break;
        case 1: value = this.rrc(value); break;
        case 2: value = this.rl(value); break;
        case 3: value = this.rr(value); break;
        case 4: value = this.sla(value); break;
        case 5: value = this.sra(value); break;
        case 6: value = this.sll(value); break;
        case 7: value = this.srl(value); break;
      }
      this.write(addr, value);
      this.cycles += 23;
    } else {
      const bitNum = (operation - 8) & 7;
      const group = operation >> 3;
      if (group === 1) {
        this.bit(bitNum, value);
        this.cycles += 20;
      } else if (group === 2) {
        this.write(addr, value & ~(1 << bitNum));
        this.cycles += 23;
      } else {
        this.write(addr, value | (1 << bitNum));
        this.cycles += 23;
      }
    }
  }

  // --- Helper: get/set register by index (B=0,C=1,D=2,E=3,H=4,L=5,(HL)=6,A=7) ---
  private getReg8(index: number): number {
    switch (index) {
      case 0: return this.b;
      case 1: return this.c;
      case 2: return this.d;
      case 3: return this.e;
      case 4: return this.h;
      case 5: return this.l;
      case 6: return this.read(this.hl);
      case 7: return this.a;
      default: return 0;
    }
  }

  private setReg8(index: number, value: number): void {
    switch (index) {
      case 0: this.b = value; break;
      case 1: this.c = value; break;
      case 2: this.d = value; break;
      case 3: this.e = value; break;
      case 4: this.h = value; break;
      case 5: this.l = value; break;
      case 6: this.write(this.hl, value); break;
      case 7: this.a = value; break;
    }
  }

  // --- ADD IX/IY,rr helper ---
  private addIX(value: number): number {
    const result = this.ix + value;
    this.f =
      (this.f & (FLAG_S | FLAG_Z | FLAG_PV)) |
      (result > 0xffff ? FLAG_C : 0) |
      ((this.ix ^ value ^ result) & 0x1000 ? FLAG_H : 0);
    return result & 0xffff;
  }

  private addIY(value: number): number {
    const result = this.iy + value;
    this.f =
      (this.f & (FLAG_S | FLAG_Z | FLAG_PV)) |
      (result > 0xffff ? FLAG_C : 0) |
      ((this.iy ^ value ^ result) & 0x1000 ? FLAG_H : 0);
    return result & 0xffff;
  }

  // --- IN (C) with flags ---
  private inC(): number {
    const value = this.ioRead(this.bc);
    this.f = (this.f & FLAG_C) | SZ_TABLE[value] | PARITY_TABLE[value];
    return value;
  }

  // --- Block transfer/search helpers ---
  private ldi(): void {
    const val = this.read(this.hl);
    this.write(this.de, val);
    this.hl = (this.hl + 1) & 0xffff;
    this.de = (this.de + 1) & 0xffff;
    this.bc = (this.bc - 1) & 0xffff;
    this.f = (this.f & (FLAG_S | FLAG_Z | FLAG_C)) | (this.bc !== 0 ? FLAG_PV : 0);
  }

  private ldd(): void {
    const val = this.read(this.hl);
    this.write(this.de, val);
    this.hl = (this.hl - 1) & 0xffff;
    this.de = (this.de - 1) & 0xffff;
    this.bc = (this.bc - 1) & 0xffff;
    this.f = (this.f & (FLAG_S | FLAG_Z | FLAG_C)) | (this.bc !== 0 ? FLAG_PV : 0);
  }

  private cpi(): void {
    const val = this.read(this.hl);
    const result = (this.a - val) & 0xff;
    this.hl = (this.hl + 1) & 0xffff;
    this.bc = (this.bc - 1) & 0xffff;
    this.f =
      (this.f & FLAG_C) | FLAG_N |
      SZ_TABLE[result] |
      ((this.a ^ val ^ result) & FLAG_H) |
      (this.bc !== 0 ? FLAG_PV : 0);
  }

  private cpd(): void {
    const val = this.read(this.hl);
    const result = (this.a - val) & 0xff;
    this.hl = (this.hl - 1) & 0xffff;
    this.bc = (this.bc - 1) & 0xffff;
    this.f =
      (this.f & FLAG_C) | FLAG_N |
      SZ_TABLE[result] |
      ((this.a ^ val ^ result) & FLAG_H) |
      (this.bc !== 0 ? FLAG_PV : 0);
  }

  private ini(): void {
    const val = this.ioRead(this.bc);
    this.write(this.hl, val);
    this.hl = (this.hl + 1) & 0xffff;
    this.b = (this.b - 1) & 0xff;
    this.f = (this.f & FLAG_C) | (this.b === 0 ? FLAG_Z : 0) | FLAG_N;
  }

  private ind(): void {
    const val = this.ioRead(this.bc);
    this.write(this.hl, val);
    this.hl = (this.hl - 1) & 0xffff;
    this.b = (this.b - 1) & 0xff;
    this.f = (this.f & FLAG_C) | (this.b === 0 ? FLAG_Z : 0) | FLAG_N;
  }

  private outi(): void {
    const val = this.read(this.hl);
    this.b = (this.b - 1) & 0xff;
    this.ioWrite(this.bc, val);
    this.hl = (this.hl + 1) & 0xffff;
    this.f = (this.f & FLAG_C) | (this.b === 0 ? FLAG_Z : 0) | FLAG_N;
  }

  private outd(): void {
    const val = this.read(this.hl);
    this.b = (this.b - 1) & 0xff;
    this.ioWrite(this.bc, val);
    this.hl = (this.hl - 1) & 0xffff;
    this.f = (this.f & FLAG_C) | (this.b === 0 ? FLAG_Z : 0) | FLAG_N;
  }

  // --- DAA ---
  private daa(): void {
    let correction = 0;
    let carry = this.f & FLAG_C;
    const nFlag = this.f & FLAG_N;
    const hFlag = this.f & FLAG_H;
    const aLo = this.a & 0x0f;

    if (nFlag) {
      // After subtraction
      if (hFlag || aLo > 9) correction |= 0x06;
      if (carry || this.a > 0x99) { correction |= 0x60; carry = FLAG_C; }
      this.a = (this.a - correction) & 0xff;
    } else {
      // After addition
      if (hFlag || aLo > 9) correction |= 0x06;
      if (carry || this.a > 0x99) { correction |= 0x60; carry = FLAG_C; }
      this.a = (this.a + correction) & 0xff;
    }

    // H flag: set if low nibble changed from >=A to <A (add) or from <6 to >=6 (sub)
    const hResult = nFlag ? (hFlag && aLo < 6 ? FLAG_H : 0) : (aLo > 9 ? FLAG_H : 0);
    this.f = SZ_TABLE[this.a] | PARITY_TABLE[this.a] | carry | nFlag | hResult;
  }

  // --- State snapshot ---
  getPC(): number {
    return this.pc;
  }

  getState(): Z80State {
    return {
      a: this.a, f: this.f,
      b: this.b, c: this.c, d: this.d, e: this.e, h: this.h, l: this.l,
      a_: this.a_, f_: this.f_,
      b_: this.b_, c_: this.c_, d_: this.d_, e_: this.e_, h_: this.h_, l_: this.l_,
      ix: this.ix, iy: this.iy,
      sp: this.sp, pc: this.pc, i: this.i, r: this.r,
      iff1: this.iff1, iff2: this.iff2, im: this.im,
      cycles: this.cycles, halted: this.halted,
    };
  }

  /** Run for N cycles. */
  run(maxCycles: number): number {
    const start = this.cycles;
    while (this.cycles - start < maxCycles && !this.halted) {
      this.step();
    }
    return this.cycles - start;
  }
}

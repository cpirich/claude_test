/**
 * Intel 8080 CPU Emulator
 *
 * The 8080 is the predecessor to the Z80 with a simpler instruction set:
 * - 256 opcodes, no prefix groups
 * - 8 registers: A, B, C, D, E, H, L, and flags (F)
 * - Register pairs: BC, DE, HL, PSW (AF)
 * - 16-bit stack pointer and program counter
 * - Flag register: S Z 0 AC 0 P 1 CY
 * - IN/OUT port I/O (256 ports)
 * - 8 RST interrupt vectors (RST 0-7)
 */

import type { Memory } from '@/cpu/types';
import type { IOBus } from '@/cpu/z80/types';
import { NullIOBus } from '@/cpu/z80/types';
import {
  FLAG_CY, FLAG_P, FLAG_AC, FLAG_Z, FLAG_S,
  FLAG_ALWAYS_ONE, FLAG_MASK,
} from './types';

// Precomputed parity table: true if byte has even number of 1-bits
const PARITY_TABLE: Uint8Array = (() => {
  const table = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    let bits = i;
    let count = 0;
    while (bits) {
      count += bits & 1;
      bits >>= 1;
    }
    // FLAG_P set if even parity
    table[i] = (count & 1) === 0 ? FLAG_P : 0;
  }
  return table;
})();

// Precomputed S+Z+P flags table
const SZP_TABLE: Uint8Array = (() => {
  const table = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    table[i] =
      (i === 0 ? FLAG_Z : 0) |
      (i & FLAG_S) |
      PARITY_TABLE[i];
  }
  return table;
})();

// Cycle counts for each opcode
const CYCLES: Uint8Array = new Uint8Array([
//  0   1   2   3   4   5   6   7   8   9   A   B   C   D   E   F
    4, 10,  7,  5,  5,  5,  7,  4,  4, 10,  7,  5,  5,  5,  7,  4, // 0x
    4, 10,  7,  5,  5,  5,  7,  4,  4, 10,  7,  5,  5,  5,  7,  4, // 1x
    4, 10, 16,  5,  5,  5,  7,  4,  4, 10, 16,  5,  5,  5,  7,  4, // 2x
    4, 10, 13,  5, 10, 10, 10,  4,  4, 10, 13,  5,  5,  5,  7,  4, // 3x
    5,  5,  5,  5,  5,  5,  7,  5,  5,  5,  5,  5,  5,  5,  7,  5, // 4x
    5,  5,  5,  5,  5,  5,  7,  5,  5,  5,  5,  5,  5,  5,  7,  5, // 5x
    5,  5,  5,  5,  5,  5,  7,  5,  5,  5,  5,  5,  5,  5,  7,  5, // 6x
    7,  7,  7,  7,  7,  7,  7,  7,  5,  5,  5,  5,  5,  5,  7,  5, // 7x
    4,  4,  4,  4,  4,  4,  7,  4,  4,  4,  4,  4,  4,  4,  7,  4, // 8x
    4,  4,  4,  4,  4,  4,  7,  4,  4,  4,  4,  4,  4,  4,  7,  4, // 9x
    4,  4,  4,  4,  4,  4,  7,  4,  4,  4,  4,  4,  4,  4,  7,  4, // Ax
    4,  4,  4,  4,  4,  4,  7,  4,  4,  4,  4,  4,  4,  4,  7,  4, // Bx
    5, 10, 10, 10, 11, 11,  7, 11,  5, 10, 10, 10, 11, 17,  7, 11, // Cx
    5, 10, 10, 10, 11, 11,  7, 11,  5, 10, 10, 10, 11, 17,  7, 11, // Dx
    5, 10, 10, 18, 11, 11,  7, 11,  5,  5, 10,  4, 11, 17,  7, 11, // Ex
    5, 10, 10,  4, 11, 11,  7, 11,  5,  5, 10,  4, 11, 17,  7, 11, // Fx
]);

// Additional cycles for conditional calls/returns when condition is met
const COND_CALL_EXTRA = 6;   // CALL cc: 11 base + 6 = 17 when taken
const COND_RET_EXTRA = 6;    // RET cc: 5 base + 6 = 11 when taken

export class I8080 {
  // Registers
  private _a = 0;
  private _f = FLAG_ALWAYS_ONE;
  private _b = 0;
  private _c = 0;
  private _d = 0;
  private _e = 0;
  private _h = 0;
  private _l = 0;

  // Special registers
  private _sp = 0;
  private _pc = 0;

  // State
  private _halted = false;
  private _cycles = 0;
  private _interruptsEnabled = false;

  private memory: Memory;
  private io: IOBus;

  constructor(memory: Memory, io?: IOBus) {
    this.memory = memory;
    this.io = io ?? new NullIOBus();
  }

  // --- 8-bit register accessors ---
  get a(): number { return this._a; }
  set a(v: number) { this._a = v & 0xff; }

  get f(): number { return this._f; }
  set f(v: number) { this._f = (v & FLAG_MASK) | FLAG_ALWAYS_ONE; }

  get b(): number { return this._b; }
  set b(v: number) { this._b = v & 0xff; }

  get c(): number { return this._c; }
  set c(v: number) { this._c = v & 0xff; }

  get d(): number { return this._d; }
  set d(v: number) { this._d = v & 0xff; }

  get e(): number { return this._e; }
  set e(v: number) { this._e = v & 0xff; }

  get h(): number { return this._h; }
  set h(v: number) { this._h = v & 0xff; }

  get l(): number { return this._l; }
  set l(v: number) { this._l = v & 0xff; }

  // --- 16-bit register pair accessors ---
  get af(): number { return (this._a << 8) | this._f; }
  set af(v: number) { this._a = (v >> 8) & 0xff; this._f = (v & FLAG_MASK) | FLAG_ALWAYS_ONE; }

  get bc(): number { return (this._b << 8) | this._c; }
  set bc(v: number) { this._b = (v >> 8) & 0xff; this._c = v & 0xff; }

  get de(): number { return (this._d << 8) | this._e; }
  set de(v: number) { this._d = (v >> 8) & 0xff; this._e = v & 0xff; }

  get hl(): number { return (this._h << 8) | this._l; }
  set hl(v: number) { this._h = (v >> 8) & 0xff; this._l = v & 0xff; }

  get sp(): number { return this._sp; }
  set sp(v: number) { this._sp = v & 0xffff; }

  get pc(): number { return this._pc; }
  set pc(v: number) { this._pc = v & 0xffff; }

  get halted(): boolean { return this._halted; }
  set halted(v: boolean) { this._halted = v; }

  get cycles(): number { return this._cycles; }
  set cycles(v: number) { this._cycles = v; }

  get interruptsEnabled(): boolean { return this._interruptsEnabled; }

  // --- Memory access ---
  private read(addr: number): number {
    return this.memory.read(addr & 0xffff);
  }

  private write(addr: number, value: number): void {
    this.memory.write(addr & 0xffff, value & 0xff);
  }

  private read16(addr: number): number {
    const lo = this.read(addr);
    const hi = this.read(addr + 1);
    return (hi << 8) | lo;
  }

  private write16(addr: number, value: number): void {
    this.write(addr, value & 0xff);
    this.write(addr + 1, (value >> 8) & 0xff);
  }

  // --- Fetch from PC ---
  private fetchByte(): number {
    const v = this.read(this._pc);
    this._pc = (this._pc + 1) & 0xffff;
    return v;
  }

  private fetchWord(): number {
    const lo = this.fetchByte();
    const hi = this.fetchByte();
    return (hi << 8) | lo;
  }

  // --- Stack operations ---
  private pushWord(value: number): void {
    this._sp = (this._sp - 1) & 0xffff;
    this.write(this._sp, (value >> 8) & 0xff);
    this._sp = (this._sp - 1) & 0xffff;
    this.write(this._sp, value & 0xff);
  }

  private popWord(): number {
    const lo = this.read(this._sp);
    this._sp = (this._sp + 1) & 0xffff;
    const hi = this.read(this._sp);
    this._sp = (this._sp + 1) & 0xffff;
    return (hi << 8) | lo;
  }

  // --- Flag helpers ---
  private szp(value: number): void {
    this._f = (this._f & FLAG_CY) | SZP_TABLE[value & 0xff] | FLAG_ALWAYS_ONE;
  }

  // Get/set register by 3-bit code: B=0, C=1, D=2, E=3, H=4, L=5, M=6, A=7
  private getReg(code: number): number {
    switch (code) {
      case 0: return this._b;
      case 1: return this._c;
      case 2: return this._d;
      case 3: return this._e;
      case 4: return this._h;
      case 5: return this._l;
      case 6: return this.read(this.hl);
      case 7: return this._a;
      default: return 0;
    }
  }

  private setReg(code: number, value: number): void {
    switch (code) {
      case 0: this._b = value & 0xff; break;
      case 1: this._c = value & 0xff; break;
      case 2: this._d = value & 0xff; break;
      case 3: this._e = value & 0xff; break;
      case 4: this._h = value & 0xff; break;
      case 5: this._l = value & 0xff; break;
      case 6: this.write(this.hl, value); break;
      case 7: this._a = value & 0xff; break;
    }
  }

  // Get register pair by 2-bit code (for LXI/INX/DCX/DAD/PUSH/POP)
  private getRP(code: number): number {
    switch (code) {
      case 0: return this.bc;
      case 1: return this.de;
      case 2: return this.hl;
      case 3: return this._sp;
      default: return 0;
    }
  }

  private setRP(code: number, value: number): void {
    switch (code) {
      case 0: this.bc = value; break;
      case 1: this.de = value; break;
      case 2: this.hl = value; break;
      case 3: this._sp = value & 0xffff; break;
    }
  }

  // Push/pop pair uses AF for code 3 instead of SP
  private getPushPair(code: number): number {
    switch (code) {
      case 0: return this.bc;
      case 1: return this.de;
      case 2: return this.hl;
      case 3: return this.af;
      default: return 0;
    }
  }

  private setPopPair(code: number, value: number): void {
    switch (code) {
      case 0: this.bc = value; break;
      case 1: this.de = value; break;
      case 2: this.hl = value; break;
      case 3: this.af = value; break;
    }
  }

  // --- Condition code check ---
  private checkCondition(cc: number): boolean {
    switch (cc) {
      case 0: return (this._f & FLAG_Z) === 0;    // NZ
      case 1: return (this._f & FLAG_Z) !== 0;    // Z
      case 2: return (this._f & FLAG_CY) === 0;   // NC
      case 3: return (this._f & FLAG_CY) !== 0;   // C
      case 4: return (this._f & FLAG_P) === 0;    // PO (parity odd)
      case 5: return (this._f & FLAG_P) !== 0;    // PE (parity even)
      case 6: return (this._f & FLAG_S) === 0;    // P (positive)
      case 7: return (this._f & FLAG_S) !== 0;    // M (minus)
      default: return false;
    }
  }

  // --- ALU operations ---
  private add(value: number): void {
    const result = this._a + value;
    const r8 = result & 0xff;
    this._f =
      SZP_TABLE[r8] |
      (result > 0xff ? FLAG_CY : 0) |
      ((this._a ^ value ^ r8) & FLAG_AC) |
      FLAG_ALWAYS_ONE;
    this._a = r8;
  }

  private adc(value: number): void {
    const carry = this._f & FLAG_CY;
    const result = this._a + value + carry;
    const r8 = result & 0xff;
    this._f =
      SZP_TABLE[r8] |
      (result > 0xff ? FLAG_CY : 0) |
      ((this._a ^ value ^ r8) & FLAG_AC) |
      FLAG_ALWAYS_ONE;
    this._a = r8;
  }

  private sub(value: number): void {
    const result = this._a - value;
    const r8 = result & 0xff;
    this._f =
      SZP_TABLE[r8] |
      (result < 0 ? FLAG_CY : 0) |
      ((this._a ^ value ^ r8) & FLAG_AC) |
      FLAG_ALWAYS_ONE;
    this._a = r8;
  }

  private sbb(value: number): void {
    const carry = this._f & FLAG_CY;
    const result = this._a - value - carry;
    const r8 = result & 0xff;
    this._f =
      SZP_TABLE[r8] |
      (result < 0 ? FLAG_CY : 0) |
      ((this._a ^ value ^ r8) & FLAG_AC) |
      FLAG_ALWAYS_ONE;
    this._a = r8;
  }

  private ana(value: number): void {
    // ANA sets AC to the OR of bit 3 of the operands (8080 behavior)
    const ac = ((this._a | value) & 0x08) ? FLAG_AC : 0;
    this._a &= value;
    this._f = SZP_TABLE[this._a] | ac | FLAG_ALWAYS_ONE;
  }

  private xra(value: number): void {
    this._a ^= value;
    this._f = SZP_TABLE[this._a] | FLAG_ALWAYS_ONE;
  }

  private ora(value: number): void {
    this._a |= value;
    this._f = SZP_TABLE[this._a] | FLAG_ALWAYS_ONE;
  }

  private cmp(value: number): void {
    const result = this._a - value;
    const r8 = result & 0xff;
    this._f =
      SZP_TABLE[r8] |
      (result < 0 ? FLAG_CY : 0) |
      ((this._a ^ value ^ r8) & FLAG_AC) |
      FLAG_ALWAYS_ONE;
  }

  // --- Reset ---
  reset(): void {
    this._a = 0;
    this._f = FLAG_ALWAYS_ONE;
    this._b = this._c = this._d = this._e = this._h = this._l = 0;
    this._sp = 0;
    this._pc = 0;
    this._halted = false;
    this._cycles = 0;
    this._interruptsEnabled = false;
  }

  // --- Interrupt ---
  irq(rstVector: number): void {
    if (!this._interruptsEnabled) return;
    this._halted = false;
    this._interruptsEnabled = false;
    this.pushWord(this._pc);
    this._pc = (rstVector & 7) << 3;
    this._cycles += 11;
  }

  // --- Execute single instruction ---
  step(): number {
    if (this._halted) {
      this._cycles += 4;
      return 4;
    }

    const startCycles = this._cycles;
    const opcode = this.fetchByte();
    this._cycles += CYCLES[opcode];

    this.execute(opcode);

    return this._cycles - startCycles;
  }

  // --- Run for N cycles ---
  run(maxCycles: number): number {
    const start = this._cycles;
    while (this._cycles - start < maxCycles && !this._halted) {
      this.step();
    }
    return this._cycles - start;
  }

  // --- Main instruction execution ---
  private execute(op: number): void {
    // Decode opcode fields
    // Opcode format: xx_ddd_sss or xx_rp_xxxx depending on instruction group
    const x = (op >> 6) & 3;
    const dst = (op >> 3) & 7;
    const src = op & 7;
    const rp = (op >> 4) & 3;
    const cc = (op >> 3) & 7;

    switch (x) {
      case 0:
        this.execGroup0(op, dst, src, rp);
        break;

      case 1:
        // MOV group (and HLT)
        if (dst === 6 && src === 6) {
          // HLT (0x76)
          this._halted = true;
        } else {
          this.setReg(dst, this.getReg(src));
        }
        break;

      case 2:
        // ALU register group: ADD/ADC/SUB/SBB/ANA/XRA/ORA/CMP
        this.execALU(dst, this.getReg(src));
        break;

      case 3:
        this.execGroup3(op, dst, src, rp, cc);
        break;
    }
  }

  // Group 0: misc instructions (0x00-0x3F)
  private execGroup0(op: number, dst: number, src: number, rp: number): void {
    switch (op) {
      case 0x00: break; // NOP
      case 0x08: break; // NOP (undocumented)
      case 0x10: break; // NOP (undocumented)
      case 0x18: break; // NOP (undocumented)
      case 0x20: break; // NOP (undocumented)
      case 0x28: break; // NOP (undocumented)
      case 0x30: break; // NOP (undocumented)
      case 0x38: break; // NOP (undocumented)

      // LXI rp, d16
      case 0x01: case 0x11: case 0x21: case 0x31:
        this.setRP(rp, this.fetchWord());
        break;

      // STAX B
      case 0x02:
        this.write(this.bc, this._a);
        break;

      // STAX D
      case 0x12:
        this.write(this.de, this._a);
        break;

      // SHLD addr
      case 0x22:
        this.write16(this.fetchWord(), this.hl);
        break;

      // STA addr
      case 0x32:
        this.write(this.fetchWord(), this._a);
        break;

      // INX rp
      case 0x03: case 0x13: case 0x23: case 0x33:
        this.setRP(rp, (this.getRP(rp) + 1) & 0xffff);
        break;

      // INR dst
      case 0x04: case 0x0c: case 0x14: case 0x1c:
      case 0x24: case 0x2c: case 0x34: case 0x3c: {
        const val = this.getReg(dst);
        const result = (val + 1) & 0xff;
        this._f =
          (this._f & FLAG_CY) |
          SZP_TABLE[result] |
          ((val & 0x0f) === 0x0f ? FLAG_AC : 0) |
          FLAG_ALWAYS_ONE;
        this.setReg(dst, result);
        break;
      }

      // DCR dst
      case 0x05: case 0x0d: case 0x15: case 0x1d:
      case 0x25: case 0x2d: case 0x35: case 0x3d: {
        const val = this.getReg(dst);
        const result = (val - 1) & 0xff;
        this._f =
          (this._f & FLAG_CY) |
          SZP_TABLE[result] |
          ((val & 0x0f) === 0x00 ? FLAG_AC : 0) |
          FLAG_ALWAYS_ONE;
        this.setReg(dst, result);
        break;
      }

      // MVI dst, d8
      case 0x06: case 0x0e: case 0x16: case 0x1e:
      case 0x26: case 0x2e: case 0x36: case 0x3e:
        this.setReg(dst, this.fetchByte());
        break;

      // RLC
      case 0x07: {
        const carry = (this._a >> 7) & 1;
        this._a = ((this._a << 1) | carry) & 0xff;
        this._f = (this._f & ~FLAG_CY) | carry | FLAG_ALWAYS_ONE;
        break;
      }

      // RRC
      case 0x0f: {
        const carry = this._a & 1;
        this._a = ((this._a >> 1) | (carry << 7)) & 0xff;
        this._f = (this._f & ~FLAG_CY) | carry | FLAG_ALWAYS_ONE;
        break;
      }

      // RAL
      case 0x17: {
        const oldCarry = this._f & FLAG_CY;
        const newCarry = (this._a >> 7) & 1;
        this._a = ((this._a << 1) | oldCarry) & 0xff;
        this._f = (this._f & ~FLAG_CY) | newCarry | FLAG_ALWAYS_ONE;
        break;
      }

      // RAR
      case 0x1f: {
        const oldCarry = this._f & FLAG_CY;
        const newCarry = this._a & 1;
        this._a = ((this._a >> 1) | (oldCarry << 7)) & 0xff;
        this._f = (this._f & ~FLAG_CY) | newCarry | FLAG_ALWAYS_ONE;
        break;
      }

      // DAD rp
      case 0x09: case 0x19: case 0x29: case 0x39: {
        const result = this.hl + this.getRP(rp);
        this._f = (this._f & ~FLAG_CY) | (result > 0xffff ? FLAG_CY : 0) | FLAG_ALWAYS_ONE;
        this.hl = result & 0xffff;
        break;
      }

      // LDAX B
      case 0x0a:
        this._a = this.read(this.bc);
        break;

      // LDAX D
      case 0x1a:
        this._a = this.read(this.de);
        break;

      // LHLD addr
      case 0x2a:
        this.hl = this.read16(this.fetchWord());
        break;

      // LDA addr
      case 0x3a:
        this._a = this.read(this.fetchWord());
        break;

      // DCX rp
      case 0x0b: case 0x1b: case 0x2b: case 0x3b:
        this.setRP(rp, (this.getRP(rp) - 1) & 0xffff);
        break;

      // DAA
      case 0x27: {
        let a = this._a;
        let carry = this._f & FLAG_CY;
        let adjust = 0;

        if ((a & 0x0f) > 9 || (this._f & FLAG_AC)) {
          adjust += 0x06;
        }
        if (a > 0x99 || carry) {
          adjust += 0x60;
          carry = FLAG_CY;
        }

        const ac = ((a & 0x0f) + (adjust & 0x0f)) > 0x0f ? FLAG_AC : 0;
        a = (a + adjust) & 0xff;
        this._a = a;
        this._f = SZP_TABLE[a] | carry | ac | FLAG_ALWAYS_ONE;
        break;
      }

      // CMA
      case 0x2f:
        this._a = (~this._a) & 0xff;
        break;

      // STC
      case 0x37:
        this._f = (this._f | FLAG_CY) | FLAG_ALWAYS_ONE;
        break;

      // CMC
      case 0x3f:
        this._f = (this._f ^ FLAG_CY) | FLAG_ALWAYS_ONE;
        break;
    }
  }

  // ALU operations: opcode bits 5-3 select operation
  private execALU(aluOp: number, value: number): void {
    switch (aluOp) {
      case 0: this.add(value); break; // ADD
      case 1: this.adc(value); break; // ADC
      case 2: this.sub(value); break; // SUB
      case 3: this.sbb(value); break; // SBB
      case 4: this.ana(value); break; // ANA
      case 5: this.xra(value); break; // XRA
      case 6: this.ora(value); break; // ORA
      case 7: this.cmp(value); break; // CMP
    }
  }

  // Group 3: misc instructions (0xC0-0xFF)
  private execGroup3(op: number, _dst: number, _src: number, rp: number, cc: number): void {
    switch (op) {
      // Conditional returns: RNZ, RZ, RNC, RC, RPO, RPE, RP, RM
      case 0xc0: case 0xc8: case 0xd0: case 0xd8:
      case 0xe0: case 0xe8: case 0xf0: case 0xf8:
        if (this.checkCondition(cc)) {
          this._pc = this.popWord();
          this._cycles += COND_RET_EXTRA;
        }
        break;

      // POP rp
      case 0xc1: case 0xd1: case 0xe1: case 0xf1:
        this.setPopPair(rp, this.popWord());
        break;

      // Conditional jumps: JNZ, JZ, JNC, JC, JPO, JPE, JP, JM
      case 0xc2: case 0xca: case 0xd2: case 0xda:
      case 0xe2: case 0xea: case 0xf2: case 0xfa: {
        const addr = this.fetchWord();
        if (this.checkCondition(cc)) {
          this._pc = addr;
        }
        break;
      }

      // JMP
      case 0xc3:
        this._pc = this.fetchWord();
        break;

      // Undocumented JMP alias
      case 0xcb:
        this._pc = this.fetchWord();
        break;

      // Conditional calls: CNZ, CZ, CNC, CC, CPO, CPE, CP, CM
      case 0xc4: case 0xcc: case 0xd4: case 0xdc:
      case 0xe4: case 0xec: case 0xf4: case 0xfc: {
        const addr = this.fetchWord();
        if (this.checkCondition(cc)) {
          this.pushWord(this._pc);
          this._pc = addr;
          this._cycles += COND_CALL_EXTRA;
        }
        break;
      }

      // PUSH rp
      case 0xc5: case 0xd5: case 0xe5: case 0xf5:
        this.pushWord(this.getPushPair(rp));
        break;

      // ALU immediate: ADI, ACI, SUI, SBI, ANI, XRI, ORI, CPI
      case 0xc6: case 0xce: case 0xd6: case 0xde:
      case 0xe6: case 0xee: case 0xf6: case 0xfe:
        this.execALU(cc, this.fetchByte());
        break;

      // RST n
      case 0xc7: case 0xcf: case 0xd7: case 0xdf:
      case 0xe7: case 0xef: case 0xf7: case 0xff:
        this.pushWord(this._pc);
        this._pc = cc << 3;
        break;

      // RET
      case 0xc9:
        this._pc = this.popWord();
        break;

      // Undocumented RET alias
      case 0xd9:
        this._pc = this.popWord();
        break;

      // CALL
      case 0xcd: {
        const addr = this.fetchWord();
        this.pushWord(this._pc);
        this._pc = addr;
        break;
      }

      // Undocumented CALL aliases
      case 0xdd: case 0xed: case 0xfd: {
        const addr = this.fetchWord();
        this.pushWord(this._pc);
        this._pc = addr;
        break;
      }

      // OUT port
      case 0xd3:
        this.io.out(this.fetchByte(), this._a);
        break;

      // IN port
      case 0xdb:
        this._a = this.io.in(this.fetchByte());
        break;

      // XTHL
      case 0xe3: {
        const lo = this.read(this._sp);
        const hi = this.read((this._sp + 1) & 0xffff);
        this.write(this._sp, this._l);
        this.write((this._sp + 1) & 0xffff, this._h);
        this._l = lo;
        this._h = hi;
        break;
      }

      // PCHL
      case 0xe9:
        this._pc = this.hl;
        break;

      // XCHG
      case 0xeb: {
        const tmpD = this._d;
        const tmpE = this._e;
        this._d = this._h;
        this._e = this._l;
        this._h = tmpD;
        this._l = tmpE;
        break;
      }

      // DI
      case 0xf3:
        this._interruptsEnabled = false;
        break;

      // EI
      case 0xfb:
        this._interruptsEnabled = true;
        break;

      // SPHL
      case 0xf9:
        this._sp = this.hl;
        break;
    }
  }
}

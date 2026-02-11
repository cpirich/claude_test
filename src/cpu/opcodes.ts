import {
  AddressingMode as AM,
  Instruction,
  FLAG_C, FLAG_Z, FLAG_I, FLAG_D, FLAG_B, FLAG_U, FLAG_V, FLAG_N,
} from './types';
import type { Cpu6502 } from './cpu';

type Op = (cpu: Cpu6502) => void;

// Helper: build an instruction entry
function inst(name: string, mode: AM, cycles: number, execute: Op): Instruction {
  return { name, mode, cycles, execute };
}

// ========== Instruction implementations ==========

// --- Load/Store ---
function lda(mode: AM): Op {
  return (cpu) => {
    const addr = cpu.resolveAddress(mode);
    cpu.a = cpu.read(addr);
    cpu.updateNZ(cpu.a);
    if (cpu.pageCrossed) cpu.extraCycles = 1;
  };
}

function ldx(mode: AM): Op {
  return (cpu) => {
    const addr = cpu.resolveAddress(mode);
    cpu.x = cpu.read(addr);
    cpu.updateNZ(cpu.x);
    if (cpu.pageCrossed) cpu.extraCycles = 1;
  };
}

function ldy(mode: AM): Op {
  return (cpu) => {
    const addr = cpu.resolveAddress(mode);
    cpu.y = cpu.read(addr);
    cpu.updateNZ(cpu.y);
    if (cpu.pageCrossed) cpu.extraCycles = 1;
  };
}

function sta(mode: AM): Op {
  return (cpu) => {
    const addr = cpu.resolveAddress(mode);
    cpu.write(addr, cpu.a);
  };
}

function stx(mode: AM): Op {
  return (cpu) => {
    const addr = cpu.resolveAddress(mode);
    cpu.write(addr, cpu.x);
  };
}

function sty(mode: AM): Op {
  return (cpu) => {
    const addr = cpu.resolveAddress(mode);
    cpu.write(addr, cpu.y);
  };
}

// --- Transfer ---
const tax: Op = (cpu) => { cpu.x = cpu.a; cpu.updateNZ(cpu.x); };
const tay: Op = (cpu) => { cpu.y = cpu.a; cpu.updateNZ(cpu.y); };
const txa: Op = (cpu) => { cpu.a = cpu.x; cpu.updateNZ(cpu.a); };
const tya: Op = (cpu) => { cpu.a = cpu.y; cpu.updateNZ(cpu.a); };
const tsx: Op = (cpu) => { cpu.x = cpu.sp; cpu.updateNZ(cpu.x); };
const txs: Op = (cpu) => { cpu.sp = cpu.x; };

// --- Stack ---
const pha: Op = (cpu) => { cpu.pushByte(cpu.a); };
const php: Op = (cpu) => { cpu.pushByte(cpu.status | FLAG_B | FLAG_U); };
const pla: Op = (cpu) => { cpu.a = cpu.pullByte(); cpu.updateNZ(cpu.a); };
const plp: Op = (cpu) => { cpu.status = (cpu.pullByte() & ~FLAG_B) | FLAG_U; };

// --- Arithmetic ---
function adc(mode: AM): Op {
  return (cpu) => {
    const addr = cpu.resolveAddress(mode);
    const operand = cpu.read(addr);
    if (cpu.pageCrossed) cpu.extraCycles = 1;

    if (cpu.getFlag(FLAG_D)) {
      // BCD mode
      let lo = (cpu.a & 0x0F) + (operand & 0x0F) + (cpu.getFlag(FLAG_C) ? 1 : 0);
      let hi = (cpu.a >> 4) + (operand >> 4);
      if (lo > 9) { lo -= 10; hi++; }

      // Z flag is set based on binary result (NMOS 6502 behavior)
      const binResult = cpu.a + operand + (cpu.getFlag(FLAG_C) ? 1 : 0);
      cpu.setFlag(FLAG_Z, (binResult & 0xFF) === 0);

      // N and V flags based on BCD intermediate result
      const bcdIntermediate = (hi << 4) | (lo & 0x0F);
      cpu.setFlag(FLAG_N, (bcdIntermediate & 0x80) !== 0);
      cpu.setFlag(FLAG_V, ((~(cpu.a ^ operand) & (cpu.a ^ bcdIntermediate)) & 0x80) !== 0);

      if (hi > 9) { hi -= 10; cpu.setFlag(FLAG_C, true); } else { cpu.setFlag(FLAG_C, false); }
      cpu.a = ((hi << 4) | (lo & 0x0F)) & 0xFF;
    } else {
      const sum = cpu.a + operand + (cpu.getFlag(FLAG_C) ? 1 : 0);
      cpu.setFlag(FLAG_C, sum > 0xFF);
      cpu.setFlag(FLAG_V, ((~(cpu.a ^ operand) & (cpu.a ^ sum)) & 0x80) !== 0);
      cpu.a = sum & 0xFF;
      cpu.updateNZ(cpu.a);
    }
  };
}

function sbc(mode: AM): Op {
  return (cpu) => {
    const addr = cpu.resolveAddress(mode);
    const operand = cpu.read(addr);
    if (cpu.pageCrossed) cpu.extraCycles = 1;

    const borrow = cpu.getFlag(FLAG_C) ? 0 : 1;

    if (cpu.getFlag(FLAG_D)) {
      // BCD mode — compute binary result first for N, Z, V, C flags (NMOS 6502 behavior)
      const binResult = cpu.a - operand - borrow;
      cpu.setFlag(FLAG_V, (((cpu.a ^ operand) & (cpu.a ^ binResult)) & 0x80) !== 0);
      cpu.setFlag(FLAG_C, binResult >= 0);
      cpu.setFlag(FLAG_Z, (binResult & 0xFF) === 0);
      cpu.setFlag(FLAG_N, (binResult & 0x80) !== 0);

      // BCD adjustment
      let lo = (cpu.a & 0x0F) - (operand & 0x0F) - borrow;
      let hi = (cpu.a >> 4) - (operand >> 4);
      if (lo < 0) { lo += 10; hi--; }
      if (hi < 0) { hi += 10; }
      cpu.a = ((hi << 4) | (lo & 0x0F)) & 0xFF;
    } else {
      const diff = cpu.a - operand - borrow;
      cpu.setFlag(FLAG_C, diff >= 0);
      cpu.setFlag(FLAG_V, (((cpu.a ^ operand) & (cpu.a ^ diff)) & 0x80) !== 0);
      cpu.a = diff & 0xFF;
      cpu.updateNZ(cpu.a);
    }
  };
}

// --- Compare ---
function cmp(mode: AM): Op {
  return (cpu) => {
    const addr = cpu.resolveAddress(mode);
    const operand = cpu.read(addr);
    if (cpu.pageCrossed) cpu.extraCycles = 1;
    const result = cpu.a - operand;
    cpu.setFlag(FLAG_C, cpu.a >= operand);
    cpu.updateNZ(result & 0xFF);
  };
}

function cpx(mode: AM): Op {
  return (cpu) => {
    const addr = cpu.resolveAddress(mode);
    const operand = cpu.read(addr);
    const result = cpu.x - operand;
    cpu.setFlag(FLAG_C, cpu.x >= operand);
    cpu.updateNZ(result & 0xFF);
  };
}

function cpy(mode: AM): Op {
  return (cpu) => {
    const addr = cpu.resolveAddress(mode);
    const operand = cpu.read(addr);
    const result = cpu.y - operand;
    cpu.setFlag(FLAG_C, cpu.y >= operand);
    cpu.updateNZ(result & 0xFF);
  };
}

// --- Increment/Decrement ---
function inc(mode: AM): Op {
  return (cpu) => {
    const addr = cpu.resolveAddress(mode);
    const val = (cpu.read(addr) + 1) & 0xFF;
    cpu.write(addr, val);
    cpu.updateNZ(val);
  };
}

const inx: Op = (cpu) => { cpu.x = (cpu.x + 1) & 0xFF; cpu.updateNZ(cpu.x); };
const iny: Op = (cpu) => { cpu.y = (cpu.y + 1) & 0xFF; cpu.updateNZ(cpu.y); };

function dec(mode: AM): Op {
  return (cpu) => {
    const addr = cpu.resolveAddress(mode);
    const val = (cpu.read(addr) - 1) & 0xFF;
    cpu.write(addr, val);
    cpu.updateNZ(val);
  };
}

const dex: Op = (cpu) => { cpu.x = (cpu.x - 1) & 0xFF; cpu.updateNZ(cpu.x); };
const dey: Op = (cpu) => { cpu.y = (cpu.y - 1) & 0xFF; cpu.updateNZ(cpu.y); };

// --- Logical ---
function and(mode: AM): Op {
  return (cpu) => {
    const addr = cpu.resolveAddress(mode);
    cpu.a &= cpu.read(addr);
    cpu.updateNZ(cpu.a);
    if (cpu.pageCrossed) cpu.extraCycles = 1;
  };
}

function ora(mode: AM): Op {
  return (cpu) => {
    const addr = cpu.resolveAddress(mode);
    cpu.a |= cpu.read(addr);
    cpu.updateNZ(cpu.a);
    if (cpu.pageCrossed) cpu.extraCycles = 1;
  };
}

function eor(mode: AM): Op {
  return (cpu) => {
    const addr = cpu.resolveAddress(mode);
    cpu.a ^= cpu.read(addr);
    cpu.updateNZ(cpu.a);
    if (cpu.pageCrossed) cpu.extraCycles = 1;
  };
}

function bit(mode: AM): Op {
  return (cpu) => {
    const addr = cpu.resolveAddress(mode);
    const val = cpu.read(addr);
    cpu.setFlag(FLAG_Z, (cpu.a & val) === 0);
    cpu.setFlag(FLAG_N, (val & 0x80) !== 0);
    cpu.setFlag(FLAG_V, (val & 0x40) !== 0);
  };
}

// --- Shifts and Rotates ---
function aslAcc(): Op {
  return (cpu) => {
    cpu.setFlag(FLAG_C, (cpu.a & 0x80) !== 0);
    cpu.a = (cpu.a << 1) & 0xFF;
    cpu.updateNZ(cpu.a);
  };
}

function asl(mode: AM): Op {
  return (cpu) => {
    const addr = cpu.resolveAddress(mode);
    const val = cpu.read(addr);
    cpu.setFlag(FLAG_C, (val & 0x80) !== 0);
    const result = (val << 1) & 0xFF;
    cpu.write(addr, result);
    cpu.updateNZ(result);
  };
}

function lsrAcc(): Op {
  return (cpu) => {
    cpu.setFlag(FLAG_C, (cpu.a & 0x01) !== 0);
    cpu.a = cpu.a >> 1;
    cpu.updateNZ(cpu.a);
  };
}

function lsr(mode: AM): Op {
  return (cpu) => {
    const addr = cpu.resolveAddress(mode);
    const val = cpu.read(addr);
    cpu.setFlag(FLAG_C, (val & 0x01) !== 0);
    const result = val >> 1;
    cpu.write(addr, result);
    cpu.updateNZ(result);
  };
}

function rolAcc(): Op {
  return (cpu) => {
    const oldCarry = cpu.getFlag(FLAG_C) ? 1 : 0;
    cpu.setFlag(FLAG_C, (cpu.a & 0x80) !== 0);
    cpu.a = ((cpu.a << 1) | oldCarry) & 0xFF;
    cpu.updateNZ(cpu.a);
  };
}

function rol(mode: AM): Op {
  return (cpu) => {
    const addr = cpu.resolveAddress(mode);
    const val = cpu.read(addr);
    const oldCarry = cpu.getFlag(FLAG_C) ? 1 : 0;
    cpu.setFlag(FLAG_C, (val & 0x80) !== 0);
    const result = ((val << 1) | oldCarry) & 0xFF;
    cpu.write(addr, result);
    cpu.updateNZ(result);
  };
}

function rorAcc(): Op {
  return (cpu) => {
    const oldCarry = cpu.getFlag(FLAG_C) ? 0x80 : 0;
    cpu.setFlag(FLAG_C, (cpu.a & 0x01) !== 0);
    cpu.a = (cpu.a >> 1) | oldCarry;
    cpu.updateNZ(cpu.a);
  };
}

function ror(mode: AM): Op {
  return (cpu) => {
    const addr = cpu.resolveAddress(mode);
    const val = cpu.read(addr);
    const oldCarry = cpu.getFlag(FLAG_C) ? 0x80 : 0;
    cpu.setFlag(FLAG_C, (val & 0x01) !== 0);
    const result = (val >> 1) | oldCarry;
    cpu.write(addr, result);
    cpu.updateNZ(result);
  };
}

// --- Branches ---
const bcc: Op = (cpu) => { cpu.branch(!cpu.getFlag(FLAG_C)); };
const bcs: Op = (cpu) => { cpu.branch(cpu.getFlag(FLAG_C)); };
const beq: Op = (cpu) => { cpu.branch(cpu.getFlag(FLAG_Z)); };
const bne: Op = (cpu) => { cpu.branch(!cpu.getFlag(FLAG_Z)); };
const bmi: Op = (cpu) => { cpu.branch(cpu.getFlag(FLAG_N)); };
const bpl: Op = (cpu) => { cpu.branch(!cpu.getFlag(FLAG_N)); };
const bvs: Op = (cpu) => { cpu.branch(cpu.getFlag(FLAG_V)); };
const bvc: Op = (cpu) => { cpu.branch(!cpu.getFlag(FLAG_V)); };

// --- Jump/Call ---
function jmpAbs(): Op {
  return (cpu) => {
    const addr = cpu.resolveAddress(AM.Absolute);
    cpu.pc = addr;
  };
}

function jmpInd(): Op {
  return (cpu) => {
    const addr = cpu.resolveAddress(AM.Indirect);
    cpu.pc = addr;
  };
}

const jsr: Op = (cpu) => {
  const lo = cpu.read(cpu.pc);
  const hi = cpu.read((cpu.pc + 1) & 0xFFFF);
  // Push return address - 1 (address of last byte of JSR instruction)
  cpu.pushWord((cpu.pc + 1) & 0xFFFF);
  cpu.pc = (hi << 8) | lo;
};

const rts: Op = (cpu) => {
  cpu.pc = (cpu.pullWord() + 1) & 0xFFFF;
};

const rti: Op = (cpu) => {
  cpu.status = (cpu.pullByte() & ~FLAG_B) | FLAG_U;
  cpu.pc = cpu.pullWord();
};

// --- Flag instructions ---
const clc: Op = (cpu) => { cpu.setFlag(FLAG_C, false); };
const sec: Op = (cpu) => { cpu.setFlag(FLAG_C, true); };
const cli: Op = (cpu) => { cpu.setFlag(FLAG_I, false); };
const sei: Op = (cpu) => { cpu.setFlag(FLAG_I, true); };
const cld: Op = (cpu) => { cpu.setFlag(FLAG_D, false); };
const sed: Op = (cpu) => { cpu.setFlag(FLAG_D, true); };
const clv: Op = (cpu) => { cpu.setFlag(FLAG_V, false); };

// --- Misc ---
const nop: Op = () => {};
const brk: Op = (cpu) => {
  cpu.pc = (cpu.pc + 1) & 0xFFFF; // BRK has a padding byte
  cpu.pushWord(cpu.pc);
  cpu.pushByte(cpu.status | FLAG_B | FLAG_U);
  cpu.setFlag(FLAG_I, true);
  const lo = cpu.read(0xFFFE);
  const hi = cpu.read(0xFFFF);
  cpu.pc = (hi << 8) | lo;
};

// ========== Opcode table ==========
export function buildOpcodeTable(): (Instruction | null)[] {
  const table: (Instruction | null)[] = new Array(256).fill(null);

  function set(opcode: number, name: string, mode: AM, cycles: number, exec: Op): void {
    table[opcode] = inst(name, mode, cycles, exec);
  }

  // --- LDA ---
  set(0xA9, 'LDA', AM.Immediate,       2, lda(AM.Immediate));
  set(0xA5, 'LDA', AM.ZeroPage,        3, lda(AM.ZeroPage));
  set(0xB5, 'LDA', AM.ZeroPageX,       4, lda(AM.ZeroPageX));
  set(0xAD, 'LDA', AM.Absolute,        4, lda(AM.Absolute));
  set(0xBD, 'LDA', AM.AbsoluteX,       4, lda(AM.AbsoluteX));
  set(0xB9, 'LDA', AM.AbsoluteY,       4, lda(AM.AbsoluteY));
  set(0xA1, 'LDA', AM.IndexedIndirectX, 6, lda(AM.IndexedIndirectX));
  set(0xB1, 'LDA', AM.IndirectIndexedY, 5, lda(AM.IndirectIndexedY));

  // --- LDX ---
  set(0xA2, 'LDX', AM.Immediate,  2, ldx(AM.Immediate));
  set(0xA6, 'LDX', AM.ZeroPage,   3, ldx(AM.ZeroPage));
  set(0xB6, 'LDX', AM.ZeroPageY,  4, ldx(AM.ZeroPageY));
  set(0xAE, 'LDX', AM.Absolute,   4, ldx(AM.Absolute));
  set(0xBE, 'LDX', AM.AbsoluteY,  4, ldx(AM.AbsoluteY));

  // --- LDY ---
  set(0xA0, 'LDY', AM.Immediate,  2, ldy(AM.Immediate));
  set(0xA4, 'LDY', AM.ZeroPage,   3, ldy(AM.ZeroPage));
  set(0xB4, 'LDY', AM.ZeroPageX,  4, ldy(AM.ZeroPageX));
  set(0xAC, 'LDY', AM.Absolute,   4, ldy(AM.Absolute));
  set(0xBC, 'LDY', AM.AbsoluteX,  4, ldy(AM.AbsoluteX));

  // --- STA ---
  set(0x85, 'STA', AM.ZeroPage,        3, sta(AM.ZeroPage));
  set(0x95, 'STA', AM.ZeroPageX,       4, sta(AM.ZeroPageX));
  set(0x8D, 'STA', AM.Absolute,        4, sta(AM.Absolute));
  set(0x9D, 'STA', AM.AbsoluteX,       5, sta(AM.AbsoluteX));
  set(0x99, 'STA', AM.AbsoluteY,       5, sta(AM.AbsoluteY));
  set(0x81, 'STA', AM.IndexedIndirectX, 6, sta(AM.IndexedIndirectX));
  set(0x91, 'STA', AM.IndirectIndexedY, 6, sta(AM.IndirectIndexedY));

  // --- STX ---
  set(0x86, 'STX', AM.ZeroPage,  3, stx(AM.ZeroPage));
  set(0x96, 'STX', AM.ZeroPageY, 4, stx(AM.ZeroPageY));
  set(0x8E, 'STX', AM.Absolute,  4, stx(AM.Absolute));

  // --- STY ---
  set(0x84, 'STY', AM.ZeroPage,  3, sty(AM.ZeroPage));
  set(0x94, 'STY', AM.ZeroPageX, 4, sty(AM.ZeroPageX));
  set(0x8C, 'STY', AM.Absolute,  4, sty(AM.Absolute));

  // --- Transfer ---
  set(0xAA, 'TAX', AM.Implicit, 2, tax);
  set(0xA8, 'TAY', AM.Implicit, 2, tay);
  set(0x8A, 'TXA', AM.Implicit, 2, txa);
  set(0x98, 'TYA', AM.Implicit, 2, tya);
  set(0xBA, 'TSX', AM.Implicit, 2, tsx);
  set(0x9A, 'TXS', AM.Implicit, 2, txs);

  // --- Stack ---
  set(0x48, 'PHA', AM.Implicit, 3, pha);
  set(0x08, 'PHP', AM.Implicit, 3, php);
  set(0x68, 'PLA', AM.Implicit, 4, pla);
  set(0x28, 'PLP', AM.Implicit, 4, plp);

  // --- ADC ---
  set(0x69, 'ADC', AM.Immediate,       2, adc(AM.Immediate));
  set(0x65, 'ADC', AM.ZeroPage,        3, adc(AM.ZeroPage));
  set(0x75, 'ADC', AM.ZeroPageX,       4, adc(AM.ZeroPageX));
  set(0x6D, 'ADC', AM.Absolute,        4, adc(AM.Absolute));
  set(0x7D, 'ADC', AM.AbsoluteX,       4, adc(AM.AbsoluteX));
  set(0x79, 'ADC', AM.AbsoluteY,       4, adc(AM.AbsoluteY));
  set(0x61, 'ADC', AM.IndexedIndirectX, 6, adc(AM.IndexedIndirectX));
  set(0x71, 'ADC', AM.IndirectIndexedY, 5, adc(AM.IndirectIndexedY));

  // --- SBC ---
  set(0xE9, 'SBC', AM.Immediate,       2, sbc(AM.Immediate));
  set(0xE5, 'SBC', AM.ZeroPage,        3, sbc(AM.ZeroPage));
  set(0xF5, 'SBC', AM.ZeroPageX,       4, sbc(AM.ZeroPageX));
  set(0xED, 'SBC', AM.Absolute,        4, sbc(AM.Absolute));
  set(0xFD, 'SBC', AM.AbsoluteX,       4, sbc(AM.AbsoluteX));
  set(0xF9, 'SBC', AM.AbsoluteY,       4, sbc(AM.AbsoluteY));
  set(0xE1, 'SBC', AM.IndexedIndirectX, 6, sbc(AM.IndexedIndirectX));
  set(0xF1, 'SBC', AM.IndirectIndexedY, 5, sbc(AM.IndirectIndexedY));

  // --- CMP ---
  set(0xC9, 'CMP', AM.Immediate,       2, cmp(AM.Immediate));
  set(0xC5, 'CMP', AM.ZeroPage,        3, cmp(AM.ZeroPage));
  set(0xD5, 'CMP', AM.ZeroPageX,       4, cmp(AM.ZeroPageX));
  set(0xCD, 'CMP', AM.Absolute,        4, cmp(AM.Absolute));
  set(0xDD, 'CMP', AM.AbsoluteX,       4, cmp(AM.AbsoluteX));
  set(0xD9, 'CMP', AM.AbsoluteY,       4, cmp(AM.AbsoluteY));
  set(0xC1, 'CMP', AM.IndexedIndirectX, 6, cmp(AM.IndexedIndirectX));
  set(0xD1, 'CMP', AM.IndirectIndexedY, 5, cmp(AM.IndirectIndexedY));

  // --- CPX ---
  set(0xE0, 'CPX', AM.Immediate, 2, cpx(AM.Immediate));
  set(0xE4, 'CPX', AM.ZeroPage,  3, cpx(AM.ZeroPage));
  set(0xEC, 'CPX', AM.Absolute,  4, cpx(AM.Absolute));

  // --- CPY ---
  set(0xC0, 'CPY', AM.Immediate, 2, cpy(AM.Immediate));
  set(0xC4, 'CPY', AM.ZeroPage,  3, cpy(AM.ZeroPage));
  set(0xCC, 'CPY', AM.Absolute,  4, cpy(AM.Absolute));

  // --- INC ---
  set(0xE6, 'INC', AM.ZeroPage,  5, inc(AM.ZeroPage));
  set(0xF6, 'INC', AM.ZeroPageX, 6, inc(AM.ZeroPageX));
  set(0xEE, 'INC', AM.Absolute,  6, inc(AM.Absolute));
  set(0xFE, 'INC', AM.AbsoluteX, 7, inc(AM.AbsoluteX));

  // --- INX, INY ---
  set(0xE8, 'INX', AM.Implicit, 2, inx);
  set(0xC8, 'INY', AM.Implicit, 2, iny);

  // --- DEC ---
  set(0xC6, 'DEC', AM.ZeroPage,  5, dec(AM.ZeroPage));
  set(0xD6, 'DEC', AM.ZeroPageX, 6, dec(AM.ZeroPageX));
  set(0xCE, 'DEC', AM.Absolute,  6, dec(AM.Absolute));
  set(0xDE, 'DEC', AM.AbsoluteX, 7, dec(AM.AbsoluteX));

  // --- DEX, DEY ---
  set(0xCA, 'DEX', AM.Implicit, 2, dex);
  set(0x88, 'DEY', AM.Implicit, 2, dey);

  // --- AND ---
  set(0x29, 'AND', AM.Immediate,       2, and(AM.Immediate));
  set(0x25, 'AND', AM.ZeroPage,        3, and(AM.ZeroPage));
  set(0x35, 'AND', AM.ZeroPageX,       4, and(AM.ZeroPageX));
  set(0x2D, 'AND', AM.Absolute,        4, and(AM.Absolute));
  set(0x3D, 'AND', AM.AbsoluteX,       4, and(AM.AbsoluteX));
  set(0x39, 'AND', AM.AbsoluteY,       4, and(AM.AbsoluteY));
  set(0x21, 'AND', AM.IndexedIndirectX, 6, and(AM.IndexedIndirectX));
  set(0x31, 'AND', AM.IndirectIndexedY, 5, and(AM.IndirectIndexedY));

  // --- ORA ---
  set(0x09, 'ORA', AM.Immediate,       2, ora(AM.Immediate));
  set(0x05, 'ORA', AM.ZeroPage,        3, ora(AM.ZeroPage));
  set(0x15, 'ORA', AM.ZeroPageX,       4, ora(AM.ZeroPageX));
  set(0x0D, 'ORA', AM.Absolute,        4, ora(AM.Absolute));
  set(0x1D, 'ORA', AM.AbsoluteX,       4, ora(AM.AbsoluteX));
  set(0x19, 'ORA', AM.AbsoluteY,       4, ora(AM.AbsoluteY));
  set(0x01, 'ORA', AM.IndexedIndirectX, 6, ora(AM.IndexedIndirectX));
  set(0x11, 'ORA', AM.IndirectIndexedY, 5, ora(AM.IndirectIndexedY));

  // --- EOR ---
  set(0x49, 'EOR', AM.Immediate,       2, eor(AM.Immediate));
  set(0x45, 'EOR', AM.ZeroPage,        3, eor(AM.ZeroPage));
  set(0x55, 'EOR', AM.ZeroPageX,       4, eor(AM.ZeroPageX));
  set(0x4D, 'EOR', AM.Absolute,        4, eor(AM.Absolute));
  set(0x5D, 'EOR', AM.AbsoluteX,       4, eor(AM.AbsoluteX));
  set(0x59, 'EOR', AM.AbsoluteY,       4, eor(AM.AbsoluteY));
  set(0x41, 'EOR', AM.IndexedIndirectX, 6, eor(AM.IndexedIndirectX));
  set(0x51, 'EOR', AM.IndirectIndexedY, 5, eor(AM.IndirectIndexedY));

  // --- BIT ---
  set(0x24, 'BIT', AM.ZeroPage, 3, bit(AM.ZeroPage));
  set(0x2C, 'BIT', AM.Absolute, 4, bit(AM.Absolute));

  // --- Shifts (Accumulator) ---
  set(0x0A, 'ASL', AM.Accumulator, 2, aslAcc());
  set(0x4A, 'LSR', AM.Accumulator, 2, lsrAcc());
  set(0x2A, 'ROL', AM.Accumulator, 2, rolAcc());
  set(0x6A, 'ROR', AM.Accumulator, 2, rorAcc());

  // --- ASL (memory) ---
  set(0x06, 'ASL', AM.ZeroPage,  5, asl(AM.ZeroPage));
  set(0x16, 'ASL', AM.ZeroPageX, 6, asl(AM.ZeroPageX));
  set(0x0E, 'ASL', AM.Absolute,  6, asl(AM.Absolute));
  set(0x1E, 'ASL', AM.AbsoluteX, 7, asl(AM.AbsoluteX));

  // --- LSR (memory) ---
  set(0x46, 'LSR', AM.ZeroPage,  5, lsr(AM.ZeroPage));
  set(0x56, 'LSR', AM.ZeroPageX, 6, lsr(AM.ZeroPageX));
  set(0x4E, 'LSR', AM.Absolute,  6, lsr(AM.Absolute));
  set(0x5E, 'LSR', AM.AbsoluteX, 7, lsr(AM.AbsoluteX));

  // --- ROL (memory) ---
  set(0x26, 'ROL', AM.ZeroPage,  5, rol(AM.ZeroPage));
  set(0x36, 'ROL', AM.ZeroPageX, 6, rol(AM.ZeroPageX));
  set(0x2E, 'ROL', AM.Absolute,  6, rol(AM.Absolute));
  set(0x3E, 'ROL', AM.AbsoluteX, 7, rol(AM.AbsoluteX));

  // --- ROR (memory) ---
  set(0x66, 'ROR', AM.ZeroPage,  5, ror(AM.ZeroPage));
  set(0x76, 'ROR', AM.ZeroPageX, 6, ror(AM.ZeroPageX));
  set(0x6E, 'ROR', AM.Absolute,  6, ror(AM.Absolute));
  set(0x7E, 'ROR', AM.AbsoluteX, 7, ror(AM.AbsoluteX));

  // --- Branches ---
  set(0x90, 'BCC', AM.Relative, 2, bcc);
  set(0xB0, 'BCS', AM.Relative, 2, bcs);
  set(0xF0, 'BEQ', AM.Relative, 2, beq);
  set(0xD0, 'BNE', AM.Relative, 2, bne);
  set(0x30, 'BMI', AM.Relative, 2, bmi);
  set(0x10, 'BPL', AM.Relative, 2, bpl);
  set(0x70, 'BVS', AM.Relative, 2, bvs);
  set(0x50, 'BVC', AM.Relative, 2, bvc);

  // --- Jumps ---
  set(0x4C, 'JMP', AM.Absolute, 3, jmpAbs());
  set(0x6C, 'JMP', AM.Indirect, 5, jmpInd());
  set(0x20, 'JSR', AM.Absolute, 6, jsr);
  set(0x60, 'RTS', AM.Implicit, 6, rts);
  set(0x40, 'RTI', AM.Implicit, 6, rti);

  // --- Flag instructions ---
  set(0x18, 'CLC', AM.Implicit, 2, clc);
  set(0x38, 'SEC', AM.Implicit, 2, sec);
  set(0x58, 'CLI', AM.Implicit, 2, cli);
  set(0x78, 'SEI', AM.Implicit, 2, sei);
  set(0xD8, 'CLD', AM.Implicit, 2, cld);
  set(0xF8, 'SED', AM.Implicit, 2, sed);
  set(0xB8, 'CLV', AM.Implicit, 2, clv);

  // --- Misc ---
  set(0xEA, 'NOP', AM.Implicit, 2, nop);
  set(0x00, 'BRK', AM.Implicit, 7, brk);

  return table;
}

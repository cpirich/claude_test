import {
  Memory,
  CpuState,
  AddressingMode,
  Instruction,
  FLAG_C, FLAG_Z, FLAG_I, FLAG_D, FLAG_B, FLAG_U, FLAG_V, FLAG_N,
} from './types';
import { buildOpcodeTable } from './opcodes';

export class Cpu6502 {
  // Registers
  a = 0;
  x = 0;
  y = 0;
  sp = 0xFD;
  pc = 0;
  status = FLAG_U | FLAG_I;
  cycles = 0;
  halted = false;

  // Internal state for current instruction
  pageCrossed = false;
  extraCycles = 0;

  private memory: Memory;
  private opcodeTable: (Instruction | null)[];

  constructor(memory: Memory) {
    this.memory = memory;
    this.opcodeTable = buildOpcodeTable();
  }

  // --- Memory access ---
  read(address: number): number {
    return this.memory.read(address & 0xFFFF);
  }

  write(address: number, value: number): void {
    this.memory.write(address & 0xFFFF, value & 0xFF);
  }

  // --- Stack operations ---
  pushByte(value: number): void {
    this.write(0x0100 | this.sp, value & 0xFF);
    this.sp = (this.sp - 1) & 0xFF;
  }

  pullByte(): number {
    this.sp = (this.sp + 1) & 0xFF;
    return this.read(0x0100 | this.sp);
  }

  pushWord(value: number): void {
    this.pushByte((value >> 8) & 0xFF);
    this.pushByte(value & 0xFF);
  }

  pullWord(): number {
    const lo = this.pullByte();
    const hi = this.pullByte();
    return (hi << 8) | lo;
  }

  // --- Flag helpers ---
  getFlag(flag: number): boolean {
    return (this.status & flag) !== 0;
  }

  setFlag(flag: number, value: boolean): void {
    if (value) {
      this.status |= flag;
    } else {
      this.status &= ~flag;
    }
  }

  updateNZ(value: number): void {
    this.setFlag(FLAG_Z, (value & 0xFF) === 0);
    this.setFlag(FLAG_N, (value & 0x80) !== 0);
  }

  // --- Addressing mode resolution ---
  resolveAddress(mode: AddressingMode): number {
    this.pageCrossed = false;
    switch (mode) {
      case AddressingMode.Immediate: {
        const addr = this.pc;
        this.pc = (this.pc + 1) & 0xFFFF;
        return addr;
      }
      case AddressingMode.ZeroPage: {
        const addr = this.read(this.pc);
        this.pc = (this.pc + 1) & 0xFFFF;
        return addr;
      }
      case AddressingMode.ZeroPageX: {
        const base = this.read(this.pc);
        this.pc = (this.pc + 1) & 0xFFFF;
        return (base + this.x) & 0xFF;
      }
      case AddressingMode.ZeroPageY: {
        const base = this.read(this.pc);
        this.pc = (this.pc + 1) & 0xFFFF;
        return (base + this.y) & 0xFF;
      }
      case AddressingMode.Absolute: {
        const lo = this.read(this.pc);
        const hi = this.read((this.pc + 1) & 0xFFFF);
        this.pc = (this.pc + 2) & 0xFFFF;
        return (hi << 8) | lo;
      }
      case AddressingMode.AbsoluteX: {
        const lo = this.read(this.pc);
        const hi = this.read((this.pc + 1) & 0xFFFF);
        this.pc = (this.pc + 2) & 0xFFFF;
        const base = (hi << 8) | lo;
        const addr = (base + this.x) & 0xFFFF;
        if ((base & 0xFF00) !== (addr & 0xFF00)) this.pageCrossed = true;
        return addr;
      }
      case AddressingMode.AbsoluteY: {
        const lo = this.read(this.pc);
        const hi = this.read((this.pc + 1) & 0xFFFF);
        this.pc = (this.pc + 2) & 0xFFFF;
        const base = (hi << 8) | lo;
        const addr = (base + this.y) & 0xFFFF;
        if ((base & 0xFF00) !== (addr & 0xFF00)) this.pageCrossed = true;
        return addr;
      }
      case AddressingMode.Indirect: {
        const ptrLo = this.read(this.pc);
        const ptrHi = this.read((this.pc + 1) & 0xFFFF);
        this.pc = (this.pc + 2) & 0xFFFF;
        const ptr = (ptrHi << 8) | ptrLo;
        const lo = this.read(ptr);
        const hi = this.read((ptr & 0xFF00) | ((ptr + 1) & 0xFF));
        return (hi << 8) | lo;
      }
      case AddressingMode.IndexedIndirectX: {
        const base = this.read(this.pc);
        this.pc = (this.pc + 1) & 0xFFFF;
        const ptr = (base + this.x) & 0xFF;
        const lo = this.read(ptr);
        const hi = this.read((ptr + 1) & 0xFF);
        return (hi << 8) | lo;
      }
      case AddressingMode.IndirectIndexedY: {
        const ptr = this.read(this.pc);
        this.pc = (this.pc + 1) & 0xFFFF;
        const lo = this.read(ptr);
        const hi = this.read((ptr + 1) & 0xFF);
        const base = (hi << 8) | lo;
        const addr = (base + this.y) & 0xFFFF;
        if ((base & 0xFF00) !== (addr & 0xFF00)) this.pageCrossed = true;
        return addr;
      }
      case AddressingMode.Relative: {
        const offset = this.read(this.pc);
        this.pc = (this.pc + 1) & 0xFFFF;
        return offset < 0x80 ? offset : offset - 256;
      }
      default:
        return 0;
    }
  }

  // --- Branch helper ---
  branch(condition: boolean): void {
    const offset = this.resolveAddress(AddressingMode.Relative);
    if (condition) {
      const oldPc = this.pc;
      this.pc = (this.pc + offset) & 0xFFFF;
      this.cycles++;
      if ((oldPc & 0xFF00) !== (this.pc & 0xFF00)) {
        this.cycles++;
      }
    }
  }

  // --- Reset / IRQ / NMI ---
  reset(): void {
    this.a = 0;
    this.x = 0;
    this.y = 0;
    this.sp = 0xFD;
    this.status = FLAG_U | FLAG_I;
    this.cycles = 0;
    this.halted = false;
    const lo = this.read(0xFFFC);
    const hi = this.read(0xFFFD);
    this.pc = (hi << 8) | lo;
  }

  irq(): void {
    if (this.getFlag(FLAG_I)) return;
    this.pushWord(this.pc);
    this.pushByte((this.status | FLAG_U) & ~FLAG_B);
    this.setFlag(FLAG_I, true);
    const lo = this.read(0xFFFE);
    const hi = this.read(0xFFFF);
    this.pc = (hi << 8) | lo;
    this.cycles += 7;
  }

  nmi(): void {
    this.pushWord(this.pc);
    this.pushByte((this.status | FLAG_U) & ~FLAG_B);
    this.setFlag(FLAG_I, true);
    const lo = this.read(0xFFFA);
    const hi = this.read(0xFFFB);
    this.pc = (hi << 8) | lo;
    this.cycles += 7;
  }

  // --- Execute single instruction ---
  step(): number {
    if (this.halted) return 0;

    const startCycles = this.cycles;
    const opcode = this.read(this.pc);
    this.pc = (this.pc + 1) & 0xFFFF;

    const instr = this.opcodeTable[opcode];
    if (!instr) {
      this.cycles += 2;
      return 2;
    }

    this.pageCrossed = false;
    this.extraCycles = 0;
    instr.execute(this);
    this.cycles += instr.cycles + this.extraCycles;

    return this.cycles - startCycles;
  }

  // --- Run for N cycles ---
  run(maxCycles: number): number {
    const startCycles = this.cycles;
    while (this.cycles - startCycles < maxCycles && !this.halted) {
      this.step();
    }
    return this.cycles - startCycles;
  }

  // --- Compatibility getters ---
  getPC(): number {
    return this.pc;
  }

  getState(): CpuState {
    return {
      a: this.a,
      x: this.x,
      y: this.y,
      sp: this.sp,
      pc: this.pc,
      status: this.status,
      cycles: this.cycles,
      halted: this.halted,
    };
  }
}

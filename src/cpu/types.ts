export interface Memory {
  read(address: number): number;
  write(address: number, value: number): void;
}

export interface CpuState {
  a: number;   // Accumulator
  x: number;   // X index register
  y: number;   // Y index register
  sp: number;  // Stack pointer
  pc: number;  // Program counter
  status: number; // Processor status (NV-BDIZC)
  cycles: number; // Total elapsed cycles
  halted: boolean;
}

// Status flag bit positions
export const FLAG_C = 0x01; // Carry
export const FLAG_Z = 0x02; // Zero
export const FLAG_I = 0x04; // Interrupt disable
export const FLAG_D = 0x08; // Decimal mode
export const FLAG_B = 0x10; // Break
export const FLAG_U = 0x20; // Unused (always 1)
export const FLAG_V = 0x40; // Overflow
export const FLAG_N = 0x80; // Negative

export enum AddressingMode {
  Implicit,
  Accumulator,
  Immediate,
  ZeroPage,
  ZeroPageX,
  ZeroPageY,
  Relative,
  Absolute,
  AbsoluteX,
  AbsoluteY,
  Indirect,
  IndexedIndirectX,
  IndirectIndexedY,
}

export interface Instruction {
  name: string;
  mode: AddressingMode;
  cycles: number;
  execute: (cpu: Cpu6502) => void;
}

// Forward reference — resolved at import time
export type Cpu6502 = import('./cpu').Cpu6502;

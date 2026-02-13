/**
 * 6502 CPU Test Harness
 *
 * Runs pre-assembled 6502 test suite binaries against the CPU emulator
 * and detects pass/fail by monitoring for trap loops (JMP-to-self).
 *
 * Supports:
 * - Klaus Dormann's 6502 functional test suite
 * - Bruce Clark's decimal mode tests
 * - Any program that signals completion via a JMP-to-self trap
 */

import { Cpu6502 } from '@/cpu/cpu';
import type { Memory } from '@/cpu/types';

/**
 * Simple 64KB flat RAM implementing the Memory interface.
 * No I/O mapping — all addresses are plain read/write.
 */
export class FlatMemory implements Memory {
  private ram = new Uint8Array(65536);

  read(address: number): number {
    return this.ram[address & 0xFFFF];
  }

  write(address: number, value: number): void {
    this.ram[address & 0xFFFF] = value & 0xFF;
  }

  /**
   * Load binary data into memory at a given base address.
   */
  load(data: Uint8Array, baseAddress: number = 0): void {
    for (let i = 0; i < data.length; i++) {
      this.ram[(baseAddress + i) & 0xFFFF] = data[i];
    }
  }

  /**
   * Read a byte directly (for inspection in tests).
   */
  peek(address: number): number {
    return this.ram[address & 0xFFFF];
  }
}

/** Result of a test suite run */
export interface TestRunResult {
  /** Whether the test passed */
  passed: boolean;
  /** Address where the CPU got trapped */
  trapAddress: number;
  /** Total CPU cycles executed */
  cycles: number;
  /** Total instructions executed */
  instructions: number;
  /** Human-readable status message */
  message: string;
  /** How the test terminated */
  termination: 'success' | 'failure_trap' | 'cycle_limit' | 'instruction_limit';
}

/**
 * Run a 6502 test binary until a JMP-to-self trap is detected.
 *
 * Detection: after executing each instruction, check if PC has returned
 * to its pre-instruction value. A `JMP $xxxx` where $xxxx equals the
 * address of the JMP itself creates this signature.
 *
 * @param cpu       - Cpu6502 instance (memory already loaded)
 * @param successPC - PC value that indicates all tests passed
 * @param maxCycles - Maximum cycles before aborting (default 200M)
 * @param maxInstructions - Maximum instructions before aborting (default 100M)
 */
export function runUntilTrap(
  cpu: Cpu6502,
  successPC: number,
  maxCycles: number = 200_000_000,
  maxInstructions: number = 100_000_000,
): TestRunResult {
  let totalCycles = 0;
  let totalInstructions = 0;

  while (totalCycles < maxCycles && totalInstructions < maxInstructions) {
    const pcBefore = cpu.pc;
    const elapsed = cpu.step();
    totalCycles += elapsed;
    totalInstructions++;

    // Trap detected: PC didn't change after executing an instruction
    if (cpu.pc === pcBefore) {
      const passed = cpu.pc === successPC;
      return {
        passed,
        trapAddress: cpu.pc,
        cycles: totalCycles,
        instructions: totalInstructions,
        termination: passed ? 'success' : 'failure_trap',
        message: passed
          ? `All tests passed! Trapped at $${cpu.pc.toString(16).padStart(4, '0')} after ${totalInstructions.toLocaleString()} instructions (${totalCycles.toLocaleString()} cycles)`
          : `Test FAILED: trapped at $${cpu.pc.toString(16).padStart(4, '0')} (expected $${successPC.toString(16).padStart(4, '0')}) after ${totalInstructions.toLocaleString()} instructions`,
      };
    }
  }

  const limitType = totalCycles >= maxCycles ? 'cycle_limit' : 'instruction_limit';
  return {
    passed: false,
    trapAddress: cpu.pc,
    cycles: totalCycles,
    instructions: totalInstructions,
    termination: limitType,
    message: `Test did not complete: ${limitType} reached (PC=$${cpu.pc.toString(16).padStart(4, '0')}, ${totalInstructions.toLocaleString()} instructions, ${totalCycles.toLocaleString()} cycles)`,
  };
}

/**
 * Load the Klaus Dormann 6502 functional test binary and prepare
 * the CPU for execution.
 *
 * The binary is a full 64KB image. The test code starts at $0400.
 * The reset vector in the binary points to a trap ($37A3), so we
 * bypass reset() and set PC directly.
 */
export function setupFunctionalTest(data: Uint8Array): { cpu: Cpu6502; memory: FlatMemory } {
  if (data.length !== 65536) {
    throw new Error(`Functional test binary must be 65536 bytes, got ${data.length}`);
  }

  const memory = new FlatMemory();
  memory.load(data, 0x0000);

  const cpu = new Cpu6502(memory);
  // Don't call cpu.reset() — the binary's reset vector points to a trap.
  // Set up initial CPU state manually, matching power-on + CLD.
  cpu.pc = 0x0400;
  cpu.sp = 0xFD;
  cpu.status = 0x24; // Unused bit set, IRQ disabled
  cpu.a = 0;
  cpu.x = 0;
  cpu.y = 0;
  cpu.cycles = 0;
  cpu.halted = false;

  return { cpu, memory };
}

/**
 * Load Bruce Clark's decimal mode test and prepare the CPU.
 *
 * The binary is assembled to load at $0200. Entry point is $0200.
 * The ERROR variable at $0B should be 0 after all tests pass.
 */
export function setupDecimalTest(data: Uint8Array): { cpu: Cpu6502; memory: FlatMemory } {
  const memory = new FlatMemory();
  memory.load(data, 0x0200);

  const cpu = new Cpu6502(memory);
  cpu.pc = 0x0200;
  cpu.sp = 0xFD;
  cpu.status = 0x24;
  cpu.a = 0;
  cpu.x = 0;
  cpu.y = 0;
  cpu.cycles = 0;
  cpu.halted = false;

  return { cpu, memory };
}

/** Known addresses for the pre-assembled test binaries */
export const TEST_ADDRESSES = {
  /** Klaus Dormann functional test: all tests passed */
  FUNCTIONAL_SUCCESS: 0x3469,

  /** Klaus Dormann functional test: entry point */
  FUNCTIONAL_ENTRY: 0x0400,

  /** Bruce Clark decimal test: done trap (JMP to self) */
  DECIMAL_DONE: 0x024B,

  /** Bruce Clark decimal test: ERROR variable (0 = pass) */
  DECIMAL_ERROR_ADDR: 0x0B,

  /** Bruce Clark decimal test: entry point */
  DECIMAL_ENTRY: 0x0200,
} as const;

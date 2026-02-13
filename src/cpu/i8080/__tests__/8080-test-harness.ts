/**
 * 8080EX1 CP/M Test Harness
 *
 * Provides a minimal CP/M-like environment for running the 8080 instruction
 * exerciser (8080EX1). This is the 8080 equivalent of ZEXDOC for the Z80.
 *
 * CP/M environment provided:
 * - BDOS function 2 (C_WRITE): Output character in register E
 * - BDOS function 9 (C_WRITESTR): Output '$'-terminated string at DE
 * - Warm boot detection: PC reaching $0000 signals test completion
 * - 64KB flat memory with .COM loaded at $0100
 */

import { I8080 } from '../i8080';
import type { Memory } from '@/cpu/types';
import type { IOBus } from '@/cpu/z80/types';

/** Simple 64KB flat RAM for the 8080. */
export class FlatMemory implements Memory {
  private ram = new Uint8Array(65536);

  read(address: number): number {
    return this.ram[address & 0xFFFF];
  }

  write(address: number, value: number): void {
    this.ram[address & 0xFFFF] = value & 0xFF;
  }

  load(data: Uint8Array, baseAddress: number = 0): void {
    for (let i = 0; i < data.length; i++) {
      this.ram[(baseAddress + i) & 0xFFFF] = data[i];
    }
  }

  peek(address: number): number {
    return this.ram[address & 0xFFFF];
  }
}

/** No-op I/O bus — 8080EX1 doesn't use port I/O. */
class NullIO implements IOBus {
  in(_port: number): number { return 0xFF; }
  out(_port: number, _value: number): void {}
}

/** Result of a single 8080EX1 test group. */
export interface ExTestGroupResult {
  name: string;
  passed: boolean;
  line: string;
  expectedCRC?: string;
  actualCRC?: string;
}

/** Result of a complete 8080EX1 run. */
export interface ExRunResult {
  allPassed: boolean;
  groups: ExTestGroupResult[];
  passCount: number;
  failCount: number;
  output: string;
  cycles: number;
  instructions: number;
  termination: 'complete' | 'cycle_limit' | 'instruction_limit';
}

/**
 * Set up the CP/M environment and 8080 CPU for running a .COM executable.
 *
 * - Loads the .COM binary at $0100
 * - Places RET at $0005 (BDOS entry point)
 * - Places HLT at $0000 (warm boot)
 * - Sets SP and pushes $0000 as return address
 * - Sets PC to $0100
 */
export function setupCPMEnvironment(comData: Uint8Array): {
  cpu: I8080;
  memory: FlatMemory;
} {
  const memory = new FlatMemory();
  const io = new NullIO();

  // Load .COM file at $0100
  memory.load(comData, 0x0100);

  // $0000: HLT — warm boot trap
  memory.write(0x0000, 0x76); // HLT

  // $0005: RET — BDOS entry (we intercept before execution)
  memory.write(0x0005, 0xC9); // RET

  const cpu = new I8080(memory, io);

  // Set up initial state
  cpu.pc = 0x0100;
  cpu.sp = 0xFFFE;

  // Push $0000 onto stack so RET from main program goes to warm boot
  cpu.sp = (cpu.sp - 2) & 0xFFFF;
  memory.write(cpu.sp, 0x00);
  memory.write(cpu.sp + 1, 0x00);

  return { cpu, memory };
}

/**
 * Run an 8080EX1 binary to completion, capturing console output.
 *
 * Intercepts BDOS calls at $0005 and handles console output.
 * Terminates when PC reaches $0000 (warm boot / HLT) or limits are hit.
 */
export function runExTest(
  cpu: I8080,
  memory: FlatMemory,
  maxCycles: number = 50_000_000_000,
  maxInstructions: number = 20_000_000_000,
  onChar?: (char: string) => void,
): ExRunResult {
  let output = '';
  let totalInstructions = 0;

  while (cpu.cycles < maxCycles && totalInstructions < maxInstructions) {
    // Check for warm boot (termination)
    if (cpu.pc === 0x0000) {
      return parseExOutput(output, cpu.cycles, totalInstructions, 'complete');
    }

    // Check for BDOS call interception
    if (cpu.pc === 0x0005) {
      const func = cpu.c;

      if (func === 2) {
        // BDOS function 2: Console output — character in E
        const ch = String.fromCharCode(cpu.e & 0x7F);
        output += ch;
        onChar?.(ch);
      } else if (func === 9) {
        // BDOS function 9: Print string at DE, '$'-terminated
        let addr = cpu.de;
        while (true) {
          const byte = memory.peek(addr);
          if (byte === 0x24) break; // '$' terminator
          const ch = String.fromCharCode(byte & 0x7F);
          output += ch;
          onChar?.(ch);
          addr = (addr + 1) & 0xFFFF;
        }
      }
      // Fall through to execute the RET at $0005
    }

    cpu.step();
    totalInstructions++;
  }

  // Hit a limit
  const termination = cpu.cycles >= maxCycles ? 'cycle_limit' : 'instruction_limit';
  return parseExOutput(output, cpu.cycles, totalInstructions, termination);
}

/**
 * Parse 8080EX1 console output into structured test results.
 */
function parseExOutput(
  output: string,
  cycles: number,
  instructions: number,
  termination: 'complete' | 'cycle_limit' | 'instruction_limit',
): ExRunResult {
  const lines = output.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const groups: ExTestGroupResult[] = [];

  for (const line of lines) {
    if (line.includes('OK') && line.includes('.')) {
      const name = line.replace(/\.+OK\s*$/, '').trim();
      if (name && !name.toLowerCase().includes('exerciser')) {
        groups.push({ name, passed: true, line });
      }
    } else if (line.includes('ERROR')) {
      const name = line.replace(/\.+\s*ERROR.*$/, '').trim();
      const crcMatch = line.match(/expected:(\w+)\s+found:(\w+)/);
      groups.push({
        name: name || '(unknown)',
        passed: false,
        line,
        expectedCRC: crcMatch?.[1],
        actualCRC: crcMatch?.[2],
      });
    }
  }

  const passCount = groups.filter(g => g.passed).length;
  const failCount = groups.filter(g => !g.passed).length;

  return {
    allPassed: failCount === 0 && passCount > 0,
    groups,
    passCount,
    failCount,
    output,
    cycles,
    instructions,
    termination,
  };
}

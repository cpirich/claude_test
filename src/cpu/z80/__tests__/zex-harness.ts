/**
 * ZEXDOC/ZEXALL CP/M Test Harness
 *
 * Provides a minimal CP/M-like environment for running the Z80 instruction
 * exerciser (ZEXDOC/ZEXALL). These programs are CP/M .COM executables that
 * use BDOS calls for console output and terminate by returning to address $0000.
 *
 * CP/M environment provided:
 * - BDOS function 2 (C_WRITE): Output character in register E
 * - BDOS function 9 (C_WRITESTR): Output '$'-terminated string at DE
 * - Warm boot detection: PC reaching $0000 signals test completion
 * - 64KB flat memory with .COM loaded at $0100
 */

import { Z80 } from '@/cpu/z80/z80';
import type { Memory, IOBus } from '@/cpu/z80/types';

/** Simple 64KB flat RAM for the Z80. */
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

/** No-op I/O bus — ZEXDOC doesn't use port I/O. */
class NullIO implements IOBus {
  in(): number { return 0xFF; }
  out(): void {}
}

/** Result of a single ZEXDOC test group */
export interface ZexTestGroupResult {
  /** Test group name (e.g., "aluop a,nn") */
  name: string;
  /** Whether this test group passed */
  passed: boolean;
  /** Raw output line */
  line: string;
  /** CRC info if failed */
  expectedCRC?: string;
  /** CRC info if failed */
  actualCRC?: string;
}

/** Result of a complete ZEXDOC/ZEXALL run */
export interface ZexRunResult {
  /** Whether all test groups passed */
  allPassed: boolean;
  /** Individual test group results */
  groups: ZexTestGroupResult[];
  /** Total groups that passed */
  passCount: number;
  /** Total groups that failed */
  failCount: number;
  /** Full console output */
  output: string;
  /** Total CPU cycles */
  cycles: number;
  /** Total instructions executed */
  instructions: number;
  /** How the test terminated */
  termination: 'complete' | 'cycle_limit' | 'instruction_limit';
}

/**
 * Set up the CP/M environment and Z80 CPU for running a .COM executable.
 *
 * - Loads the .COM binary at $0100
 * - Places RET at $0005 (BDOS entry point)
 * - Places HALT at $0000 (warm boot)
 * - Sets SP and pushes $0000 as return address
 * - Sets PC to $0100
 */
export function setupCPMEnvironment(comData: Uint8Array): {
  cpu: Z80;
  memory: FlatMemory;
} {
  const memory = new FlatMemory();
  const io = new NullIO();

  // Load .COM file at $0100
  memory.load(comData, 0x0100);

  // $0000: HALT — warm boot trap
  memory.write(0x0000, 0x76); // HALT

  // $0005: RET — BDOS entry (we intercept before execution)
  memory.write(0x0005, 0xC9); // RET

  const cpu = new Z80(memory, io);

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
 * Run a ZEXDOC/ZEXALL binary to completion, capturing console output.
 *
 * Intercepts BDOS calls at $0005 and handles console output.
 * Terminates when PC reaches $0000 (warm boot) or limits are hit.
 */
export function runZexTest(
  cpu: Z80,
  memory: FlatMemory,
  maxCycles: number = 50_000_000_000,     // ~50 billion cycles
  maxInstructions: number = 20_000_000_000, // ~20 billion instructions
  onChar?: (char: string) => void,
): ZexRunResult {
  let output = '';
  let totalInstructions = 0;

  while (cpu.cycles < maxCycles && totalInstructions < maxInstructions) {
    // Check for warm boot (termination)
    if (cpu.pc === 0x0000) {
      return parseZexOutput(output, cpu.cycles, totalInstructions, 'complete');
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
  return parseZexOutput(output, cpu.cycles, totalInstructions, termination);
}

/**
 * Parse ZEXDOC/ZEXALL console output into structured test results.
 *
 * Expected output format:
 *   Z80doc instruction exerciser
 *   <test name>....OK
 *   <test name>.... ERROR **** crc expected:XXXXXXXX found:XXXXXXXX
 *   Tests complete
 */
function parseZexOutput(
  output: string,
  cycles: number,
  instructions: number,
  termination: 'complete' | 'cycle_limit' | 'instruction_limit',
): ZexRunResult {
  const lines = output.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const groups: ZexTestGroupResult[] = [];

  for (const line of lines) {
    // Match test result lines: "test name...OK" or "test name... ERROR ..."
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

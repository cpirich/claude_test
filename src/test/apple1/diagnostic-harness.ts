/**
 * Apple-1 Diagnostic PROM Test Harness
 *
 * Provides a lightweight emulation context for running diagnostic ROMs
 * against the Apple-1 emulator. The harness captures PIA I/O interactions
 * and provides verification utilities for each diagnostic test type.
 *
 * This harness interfaces with the CPU emulator (Task #1), PIA I/O (Task #2),
 * and memory subsystem. It is designed to validate the complete system
 * integration from CPU execution through PIA register interaction to
 * terminal output.
 */

import { PIA, DISPLAY } from '@/emulator/apple1/roms/diagnostic-roms';

/** Characters captured from DSP writes */
export interface DisplayCapture {
  /** Raw bytes written to DSP ($D012), including bit 7 */
  rawBytes: number[];
  /** Decoded ASCII characters (bit 7 stripped, mapped to printable) */
  characters: string[];
  /** Full display text assembled from characters */
  text: string;
}

/** Keyboard input event to be injected */
export interface KeyboardInput {
  /** ASCII character code (bit 7 will be set automatically) */
  char: number;
  /** Cycle count at which to make the key available */
  atCycle: number;
}

/** Result of a diagnostic test execution */
export interface DiagnosticResult {
  /** Whether the test passed verification */
  passed: boolean;
  /** Human-readable description of the result */
  message: string;
  /** Characters output to the display */
  display: DisplayCapture;
  /** Total CPU cycles executed */
  cycles: number;
  /** Reason for termination */
  termination: 'halted' | 'cycle_limit' | 'error';
  /** Error details if termination === 'error' */
  error?: string;
}

/**
 * Minimal memory bus interface for the test harness.
 * This will be implemented by the actual emulator's memory subsystem.
 */
export interface MemoryBus {
  read(address: number): number;
  write(address: number, value: number): void;
}

/**
 * Minimal CPU interface for the test harness.
 * This will be implemented by the 6502 emulator core (Task #1).
 */
export interface Cpu6502 {
  /** Reset the CPU (reads reset vector, initializes registers) */
  reset(): void;
  /** Execute one instruction, returns cycle count */
  step(): number;
  /** Get the current program counter */
  getPC(): number;
}

/**
 * Apple-1 diagnostic test harness.
 *
 * Creates a self-contained test environment with:
 * - 64KB address space
 * - PIA register simulation at $D010-$D013
 * - ROM loaded at $FF00-$FFFF
 * - Display output capture
 * - Keyboard input injection
 */
export class DiagnosticHarness {
  private memory: Uint8Array;
  private displayCapture: DisplayCapture;
  private keyboardQueue: KeyboardInput[];
  private keyAvailable: boolean;
  private keyData: number;
  private dspReady: boolean;
  private totalCycles: number;
  private previousPC: number;
  private haltDetected: boolean;

  constructor() {
    this.memory = new Uint8Array(65536);
    this.displayCapture = { rawBytes: [], characters: [], text: '' };
    this.keyboardQueue = [];
    this.keyAvailable = false;
    this.keyData = 0;
    this.dspReady = true;
    this.totalCycles = 0;
    this.previousPC = -1;
    this.haltDetected = false;
  }

  /**
   * Load a 256-byte ROM image at $FF00-$FFFF.
   */
  loadROM(rom: Uint8Array): void {
    if (rom.length !== 256) {
      throw new Error(`ROM must be exactly 256 bytes, got ${rom.length}`);
    }
    this.memory.set(rom, 0xff00);
  }

  /**
   * Queue keyboard input to be delivered at a specific cycle count.
   */
  queueKeyboard(inputs: KeyboardInput[]): void {
    this.keyboardQueue = [...inputs].sort((a, b) => a.atCycle - b.atCycle);
  }

  /**
   * Get the display capture results.
   */
  getDisplay(): DisplayCapture {
    return { ...this.displayCapture };
  }

  /**
   * Create a MemoryBus that routes through PIA register handling.
   */
  createMemoryBus(): MemoryBus {
    return {
      read: (address: number): number => {
        // PIA keyboard data register
        if (address === PIA.KBD) {
          this.keyAvailable = false;
          return this.keyData;
        }

        // PIA keyboard control register
        if (address === PIA.KBDCR) {
          return this.keyAvailable ? 0x80 : 0x00;
        }

        // PIA display data register (read returns bit 7 status)
        if (address === PIA.DSP) {
          return this.dspReady ? 0x00 : 0x80;
        }

        // PIA display control register
        if (address === PIA.DSPCR) {
          return 0x00; // Always ready in test harness
        }

        return this.memory[address];
      },

      write: (address: number, value: number): void => {
        // PIA display data register - capture output
        if (address === PIA.DSP) {
          this.displayCapture.rawBytes.push(value);
          const ascii = value & 0x7f;
          const char = ascii >= 0x20 && ascii < 0x7f
            ? String.fromCharCode(ascii)
            : ascii === 0x0d
              ? '\n'
              : `<${ascii.toString(16).padStart(2, '0')}>`;
          this.displayCapture.characters.push(char);
          this.displayCapture.text += char;
          // Briefly mark DSP as busy then ready (instant in test harness)
          this.dspReady = true;
          return;
        }

        // PIA control registers - ignore writes in test harness
        if (address === PIA.KBDCR || address === PIA.DSPCR) {
          return;
        }

        // Don't allow writes to ROM area
        if (address >= 0xff00) {
          return;
        }

        this.memory[address] = value;
      },
    };
  }

  /**
   * Advance keyboard state based on cycle count.
   * Delivers queued keystrokes at the appropriate time.
   */
  private updateKeyboard(): void {
    if (this.keyAvailable || this.keyboardQueue.length === 0) {
      return;
    }
    const next = this.keyboardQueue[0];
    if (this.totalCycles >= next.atCycle) {
      this.keyboardQueue.shift();
      this.keyData = next.char | 0x80; // Apple-1 sets bit 7 on keyboard data
      this.keyAvailable = true;
    }
  }

  /**
   * Run the diagnostic ROM using the provided CPU.
   *
   * Executes until one of:
   * - The CPU enters a tight infinite loop (JMP to self)
   * - The cycle limit is reached
   * - An error occurs
   */
  run(cpu: Cpu6502, maxCycles: number = 10_000_000): DiagnosticResult {
    cpu.reset();
    this.totalCycles = 0;
    this.previousPC = -1;
    this.haltDetected = false;

    while (this.totalCycles < maxCycles) {
      this.updateKeyboard();

      const pc = cpu.getPC();

      // Detect tight infinite loop: same PC twice in a row with no pending I/O
      if (pc === this.previousPC) {
        this.haltDetected = true;
        return {
          passed: true,
          message: `Program halted at $${pc.toString(16).padStart(4, '0')} after ${this.totalCycles} cycles`,
          display: this.getDisplay(),
          cycles: this.totalCycles,
          termination: 'halted',
        };
      }
      this.previousPC = pc;

      try {
        const elapsed = cpu.step();
        this.totalCycles += elapsed;
      } catch (err) {
        return {
          passed: false,
          message: `CPU error at $${pc.toString(16).padStart(4, '0')}: ${err}`,
          display: this.getDisplay(),
          cycles: this.totalCycles,
          termination: 'error',
          error: String(err),
        };
      }
    }

    return {
      passed: false,
      message: `Cycle limit (${maxCycles}) reached without halt`,
      display: this.getDisplay(),
      cycles: this.totalCycles,
      termination: 'cycle_limit',
    };
  }
}

/**
 * Verify that a screen fill test produced the correct output.
 *
 * Checks:
 * - Exactly 960 printable characters were output (40x24 screen)
 * - Characters cycle through the Apple-1 displayable range ($20-$5F)
 * - A final CR was output
 */
export function verifyScreenFill(display: DisplayCapture): {
  passed: boolean;
  message: string;
  details: {
    totalChars: number;
    expectedChars: number;
    printableChars: number;
    hasFinalCR: boolean;
    patternCorrect: boolean;
  };
} {
  const printableBytes = display.rawBytes.filter(
    (b) => (b & 0x7f) >= 0x20 && (b & 0x7f) < 0x60
  );
  const crBytes = display.rawBytes.filter((b) => (b & 0x7f) === 0x0d);

  // Check character cycling pattern
  let patternCorrect = true;
  let expectedChar = 0x20;
  for (const byte of printableBytes) {
    const actual = byte & 0x7f;
    if (actual !== expectedChar) {
      patternCorrect = false;
      break;
    }
    expectedChar = expectedChar >= 0x5f ? 0x20 : expectedChar + 1;
  }

  const totalChars = display.rawBytes.length;
  const expectedTotal = DISPLAY.TOTAL + 1; // 960 chars + 1 CR
  const passed =
    printableBytes.length === DISPLAY.TOTAL &&
    crBytes.length >= 1 &&
    patternCorrect;

  return {
    passed,
    message: passed
      ? `Screen fill verified: ${printableBytes.length} characters in correct pattern`
      : `Screen fill failed: ${printableBytes.length}/${DISPLAY.TOTAL} printable, ` +
        `CR: ${crBytes.length >= 1}, pattern: ${patternCorrect}`,
    details: {
      totalChars,
      expectedChars: expectedTotal,
      printableChars: printableBytes.length,
      hasFinalCR: crBytes.length >= 1,
      patternCorrect,
    },
  };
}

/**
 * Verify that a DRAM test produced the expected result.
 *
 * Checks:
 * - A single character was output ('P' for pass, 'F' for fail)
 * - The correct pass/fail character matches the expected result
 */
export function verifyDRAMTest(
  display: DisplayCapture,
  expectPass: boolean = true
): {
  passed: boolean;
  message: string;
  outputChar: string;
} {
  const chars = display.rawBytes
    .map((b) => String.fromCharCode(b & 0x7f))
    .filter((c) => c >= 'A' && c <= 'Z');

  const outputChar = chars.length > 0 ? chars[0] : '(none)';
  const expectedChar = expectPass ? 'P' : 'F';
  const passed = outputChar === expectedChar;

  return {
    passed,
    message: passed
      ? `DRAM test ${expectPass ? 'passed' : 'failed as expected'}: output '${outputChar}'`
      : `DRAM test unexpected result: expected '${expectedChar}', got '${outputChar}'`,
    outputChar,
  };
}

/**
 * Verify that keyboard echo (TV Typewriter) correctly echoes input.
 *
 * Checks that each input character appears in the display output
 * in the correct order.
 */
export function verifyKeyboardEcho(
  display: DisplayCapture,
  inputChars: number[]
): {
  passed: boolean;
  message: string;
  expected: string;
  actual: string;
} {
  const expected = inputChars
    .map((c) => String.fromCharCode(c & 0x7f))
    .join('');
  const actual = display.rawBytes
    .map((b) => String.fromCharCode(b & 0x7f))
    .join('');

  const passed = actual.startsWith(expected);

  return {
    passed,
    message: passed
      ? `Keyboard echo verified: '${expected}' correctly echoed`
      : `Keyboard echo mismatch: expected '${expected}', got '${actual}'`,
    expected,
    actual,
  };
}

/**
 * Verify that the hex monitor responds to two-digit input with '=' separator.
 *
 * Checks that input like "A" "5" produces display output "A5=" followed by CR.
 */
export function verifyHexMonitor(
  display: DisplayCapture,
  digit1: number,
  digit2: number
): {
  passed: boolean;
  message: string;
  expected: string;
  actual: string;
} {
  const d1 = String.fromCharCode(digit1 & 0x7f);
  const d2 = String.fromCharCode(digit2 & 0x7f);
  const expected = `${d1}${d2}=\n`;
  const actual = display.text;

  const passed = actual.startsWith(expected);

  return {
    passed,
    message: passed
      ? `Hex monitor verified: input '${d1}${d2}' -> '${expected.trim()}'`
      : `Hex monitor mismatch: expected '${expected.trim()}', got '${actual.trim()}'`,
    expected,
    actual,
  };
}

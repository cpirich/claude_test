/**
 * Apple-1 System Integration Tests
 *
 * End-to-end tests that wire together all production components:
 *   - Cpu6502 (src/cpu/cpu.ts)
 *   - PIA (src/emulator/apple1/pia.ts)
 *   - Apple1Memory (src/emulator/apple1/memory.ts)
 *   - Terminal (src/emulator/apple1/terminal.ts)
 *   - WozMonitorROM (src/emulator/apple1/woz-monitor-rom.ts)
 *   - Diagnostic ROMs (src/emulator/apple1/roms/diagnostic-roms.ts)
 *
 * These tests validate the full system integration — CPU execution through
 * memory bus, PIA register interaction, and terminal display output.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Cpu6502 } from '@/cpu/cpu';
import { PIA } from '@/emulator/apple1/pia';
import { Apple1Memory, ROM } from '@/emulator/apple1/memory';
import { Terminal, COLS, ROWS } from '@/emulator/apple1/terminal';
import { WozMonitorROM } from '@/emulator/apple1/woz-monitor-rom';
import {
  SCREEN_FILL_ROM,
  DRAM_TEST_ROM,
  KEYBOARD_ECHO_ROM,
  HEX_MONITOR_ROM,
  DISPLAY,
} from '@/emulator/apple1/roms/diagnostic-roms';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Wrap a Uint8Array as a ROM object for Apple1Memory. */
function arrayToROM(data: Uint8Array, base: number = 0xff00): ROM {
  return {
    read(address: number): number {
      return data[address - base] ?? 0;
    },
  };
}

/** Run the CPU until it enters a tight loop or hits a cycle limit. */
function runUntilHalt(cpu: Cpu6502, maxCycles: number): {
  halted: boolean;
  cycles: number;
} {
  let totalCycles = 0;
  let prevPC = -1;

  while (totalCycles < maxCycles) {
    const pc = cpu.getPC();
    if (pc === prevPC) {
      return { halted: true, cycles: totalCycles };
    }
    prevPC = pc;
    totalCycles += cpu.step();
  }

  return { halted: false, cycles: totalCycles };
}

/** Run the CPU for a fixed number of cycles (for polling-loop programs). */
function runCycles(cpu: Cpu6502, cycles: number): number {
  let total = 0;
  while (total < cycles) {
    total += cpu.step();
  }
  return total;
}

/**
 * Run the CPU until the PC enters a specific address range,
 * indicating the program is waiting at a known polling loop.
 */
function runUntilPC(
  cpu: Cpu6502,
  targetPC: number,
  maxCycles: number
): { reached: boolean; cycles: number } {
  let total = 0;
  while (total < maxCycles) {
    if (cpu.getPC() === targetPC) {
      return { reached: true, cycles: total };
    }
    total += cpu.step();
  }
  return { reached: false, cycles: total };
}

// ---------------------------------------------------------------------------
// Test Suites
// ---------------------------------------------------------------------------

describe('Apple-1 System Integration', () => {
  let pia: PIA;
  let terminal: Terminal;
  let displayOutput: number[];

  beforeEach(() => {
    pia = new PIA();
    terminal = new Terminal();
    displayOutput = [];

    // Wire PIA display output to both terminal and raw capture
    pia.setDisplayOutputCallback((char: number) => {
      displayOutput.push(char);
      terminal.putChar(char);
    });
  });

  describe('Woz Monitor Boot', () => {
    let memory: Apple1Memory;
    let cpu: Cpu6502;

    beforeEach(() => {
      const rom = new WozMonitorROM();
      memory = new Apple1Memory(pia, rom);
      cpu = new Cpu6502(memory);
    });

    it('should boot and output the backslash prompt', () => {
      cpu.reset();

      // The Woz Monitor boot sequence:
      // 1. CLD, CLI
      // 2. Initialize PIA registers ($7F to DSP, $A7 to KBDCR/DSPCR)
      // 3. Fall through to output '\' (backslash) and CR as the prompt
      // 4. Enter keyboard polling loop at $FF29

      // Run until we hit the keyboard polling loop at $FF29
      const result = runUntilPC(cpu, 0xff29, 1_000_000);

      expect(result.reached).toBe(true);

      // Display output should include the backslash prompt
      // The boot writes: $7F (DSP init, ignored by terminal), '\' ($5C), CR ($0D)
      const printableOutput = displayOutput.filter(
        (c) => (c >= 0x20 && c <= 0x5f) || c === 0x0d
      );
      expect(printableOutput).toContain(0x5c); // backslash '\'
      expect(printableOutput).toContain(0x0d); // CR
    });

    it('should show the backslash on the terminal display', () => {
      cpu.reset();
      runUntilPC(cpu, 0xff29, 1_000_000);

      // Terminal should have the backslash on the first line
      const lines = terminal.getLines();
      expect(lines[0].trimEnd()).toBe('\\');
    });

    it('should reach keyboard polling loop after boot', () => {
      cpu.reset();
      const result = runUntilPC(cpu, 0xff29, 1_000_000);

      expect(result.reached).toBe(true);
      // The monitor should now be polling KBDCR ($D011) in a BPL loop
      // PC=$FF29 -> LDA $D011; BPL $FF29
      expect(cpu.getPC()).toBe(0xff29);
    });

    it('should echo a typed character after boot', () => {
      cpu.reset();
      // Boot to keyboard polling
      runUntilPC(cpu, 0xff29, 1_000_000);

      // Type 'A' — the monitor should echo it
      pia.keyPress(0x41); // 'A'

      // Run enough cycles for the monitor to read the key and echo it
      // The monitor reads KBD, stores in buffer, calls ECHO
      runCycles(cpu, 10_000);

      // 'A' should appear in the display output
      // The Woz Monitor echoes with bit 7 set internally, but PIA strips it
      expect(displayOutput).toContain(0x41); // 'A'
    });

    it('should respond to a CR after hex input with a memory dump', () => {
      cpu.reset();
      runUntilPC(cpu, 0xff29, 1_000_000);

      // Type "FF00" followed by CR to examine address $FF00
      const input = [0x46, 0x46, 0x30, 0x30, 0x0d]; // "FF00\r"
      for (const char of input) {
        pia.keyPress(char);
        runCycles(cpu, 20_000);
      }

      // The monitor should output the address and the byte at $FF00
      // $FF00 contains $D8 (CLD instruction)
      // Expected output includes "FF00: D8" or similar hex dump format
      const text = displayOutput
        .map((c) => (c >= 0x20 && c <= 0x5f ? String.fromCharCode(c) : ''))
        .join('');
      expect(text).toContain('FF00');
    });
  });

  describe('Screen Fill with Production CPU', () => {
    it('should fill the display with 960 characters', () => {
      const rom = arrayToROM(SCREEN_FILL_ROM);
      const memory = new Apple1Memory(pia, rom);
      const cpu = new Cpu6502(memory);

      cpu.reset();
      const result = runUntilHalt(cpu, 50_000_000);

      expect(result.halted).toBe(true);

      // Count printable characters output
      const printable = displayOutput.filter((c) => c >= 0x20 && c < 0x60);
      expect(printable.length).toBe(DISPLAY.TOTAL); // 960
    });

    it('should cycle characters $20-$5F in correct order', () => {
      const rom = arrayToROM(SCREEN_FILL_ROM);
      const memory = new Apple1Memory(pia, rom);
      const cpu = new Cpu6502(memory);

      cpu.reset();
      runUntilHalt(cpu, 50_000_000);

      const printable = displayOutput.filter((c) => c >= 0x20 && c < 0x60);
      for (let i = 0; i < printable.length; i++) {
        expect(printable[i]).toBe(0x20 + (i % 64));
      }
    });

    it('should fill the terminal screen correctly', () => {
      const rom = arrayToROM(SCREEN_FILL_ROM);
      const memory = new Apple1Memory(pia, rom);
      const cpu = new Cpu6502(memory);

      cpu.reset();
      runUntilHalt(cpu, 50_000_000);

      // 960 chars fill exactly 24 rows of 40. The wrap at end of row 23
      // triggers one scroll, and the final CR triggers another. So line 0
      // ends up containing what was originally row 2 (chars at indices 80-119).
      // Index 80 maps to character $20 + (80 % 64) = $30 = '0'.
      const line0 = terminal.getLine(0);
      expect(line0[0]).toBe('0'); // $30
      expect(line0[1]).toBe('1'); // $31
      expect(line0[2]).toBe('2'); // $32
    });

    it('should end with a CR after the screen fill', () => {
      const rom = arrayToROM(SCREEN_FILL_ROM);
      const memory = new Apple1Memory(pia, rom);
      const cpu = new Cpu6502(memory);

      cpu.reset();
      runUntilHalt(cpu, 50_000_000);

      // Last output should be CR
      const lastOutput = displayOutput[displayOutput.length - 1];
      expect(lastOutput).toBe(0x0d);
    });
  });

  describe('DRAM Test with Production CPU', () => {
    it('should report pass (P) when RAM is functional', () => {
      const rom = arrayToROM(DRAM_TEST_ROM);
      const memory = new Apple1Memory(pia, rom);
      const cpu = new Cpu6502(memory);

      cpu.reset();
      const result = runUntilHalt(cpu, 100_000_000);

      expect(result.halted).toBe(true);

      // Should output 'P' ($50)
      const letters = displayOutput.filter((c) => c >= 0x41 && c <= 0x5a);
      expect(letters.length).toBeGreaterThan(0);
      expect(String.fromCharCode(letters[0])).toBe('P');
    });

    it('should correctly test all memory pages $02-$0F', () => {
      const rom = arrayToROM(DRAM_TEST_ROM);
      const memory = new Apple1Memory(pia, rom);
      const cpu = new Cpu6502(memory);

      cpu.reset();
      runUntilHalt(cpu, 100_000_000);

      // After the test, RAM pages $02-$0F should contain the last
      // pattern that was successfully written. Verify a few spots.
      // The last pattern tested is $00 (index 0 in table, tested last
      // since X counts 3->2->1->0)
      expect(memory.peekRAM(0x0200)).toBe(0x00);
      expect(memory.peekRAM(0x0500)).toBe(0x00);
      expect(memory.peekRAM(0x0fff)).toBe(0x00);
    });
  });

  describe('Keyboard Echo with Production CPU', () => {
    it('should echo typed characters to the display', () => {
      const rom = arrayToROM(KEYBOARD_ECHO_ROM);
      const memory = new Apple1Memory(pia, rom);
      const cpu = new Cpu6502(memory);

      cpu.reset();

      // Type "HELLO" with pauses for the CPU to process each key
      const chars = [0x48, 0x45, 0x4c, 0x4c, 0x4f]; // H E L L O
      for (const char of chars) {
        // Run until we're in the keyboard polling loop
        runUntilPC(cpu, 0xff00, 100_000);
        // Press the key
        pia.keyPress(char);
        // Run enough cycles to process the key and output it
        runCycles(cpu, 1_000);
      }

      // Verify all characters were echoed
      const echoed = displayOutput.filter((c) => c >= 0x41 && c <= 0x5a);
      const text = echoed.map((c) => String.fromCharCode(c)).join('');
      expect(text).toContain('HELLO');
    });

    it('should echo characters to the terminal', () => {
      const rom = arrayToROM(KEYBOARD_ECHO_ROM);
      const memory = new Apple1Memory(pia, rom);
      const cpu = new Cpu6502(memory);

      cpu.reset();

      const chars = [0x41, 0x42, 0x43]; // A B C
      for (const char of chars) {
        runUntilPC(cpu, 0xff00, 100_000);
        pia.keyPress(char);
        runCycles(cpu, 1_000);
      }

      const line0 = terminal.getLine(0);
      expect(line0.trimEnd()).toContain('ABC');
    });
  });

  describe('Hex Monitor with Production CPU', () => {
    it('should echo two digits and output = separator', () => {
      const rom = arrayToROM(HEX_MONITOR_ROM);
      const memory = new Apple1Memory(pia, rom);
      const cpu = new Cpu6502(memory);

      cpu.reset();

      // Type first hex digit 'A'
      runUntilPC(cpu, 0xff00, 100_000);
      pia.keyPress(0x41); // 'A'
      runCycles(cpu, 1_000);

      // Type second hex digit '5'
      runUntilPC(cpu, 0xff10, 100_000); // second key wait loop
      pia.keyPress(0x35); // '5'
      runCycles(cpu, 5_000);

      // Should output: A, 5, =, CR
      const text = displayOutput
        .map((c) =>
          c >= 0x20 && c <= 0x5f
            ? String.fromCharCode(c)
            : c === 0x0d
              ? '\n'
              : ''
        )
        .join('');
      expect(text).toContain('A');
      expect(text).toContain('5');
      expect(text).toContain('=');
    });
  });

  describe('PIA Integration Verification', () => {
    it('should correctly route keyboard data through PIA to CPU', () => {
      const rom = arrayToROM(KEYBOARD_ECHO_ROM);
      const memory = new Apple1Memory(pia, rom);
      const cpu = new Cpu6502(memory);

      cpu.reset();

      // Before key press, KBDCR should report no key
      expect(memory.read(0xd011) & 0x80).toBe(0);

      // Press a key
      pia.keyPress(0x41); // 'A'

      // KBDCR should now report key available
      expect(memory.read(0xd011) & 0x80).toBe(0x80);

      // Reading KBD should return the key with bit 7 set
      const key = memory.read(0xd010);
      expect(key).toBe(0xc1); // 'A' | $80

      // After reading KBD, KBDCR bit 7 should be cleared
      expect(memory.read(0xd011) & 0x80).toBe(0);
    });

    it('should correctly route display writes from CPU through PIA', () => {
      const rom = arrayToROM(SCREEN_FILL_ROM);
      const memory = new Apple1Memory(pia, rom);

      // Directly write to DSP to verify the PIA callback fires
      memory.write(0xd012, 0x41); // Write 'A' to DSP

      expect(displayOutput.length).toBe(1);
      expect(displayOutput[0]).toBe(0x41); // 'A' (bit 7 stripped by PIA)
    });

    it('should protect ROM area from writes', () => {
      const rom = arrayToROM(SCREEN_FILL_ROM);
      const memory = new Apple1Memory(pia, rom);

      const original = memory.read(0xff00);
      memory.write(0xff00, 0x00);
      expect(memory.read(0xff00)).toBe(original);
    });
  });

  describe('Terminal Display Verification', () => {
    it('should handle 40-column line wrapping', () => {
      // Write exactly 40 characters — should fill one line
      for (let i = 0; i < COLS; i++) {
        terminal.putChar(0x41); // 'A'
      }
      expect(terminal.getCursorCol()).toBe(0);
      expect(terminal.getCursorRow()).toBe(1); // wrapped to next line

      const line0 = terminal.getLine(0);
      expect(line0).toBe('A'.repeat(COLS));
    });

    it('should handle CR correctly', () => {
      terminal.putChar(0x48); // 'H'
      terminal.putChar(0x49); // 'I'
      terminal.putChar(0x0d); // CR

      expect(terminal.getCursorCol()).toBe(0);
      expect(terminal.getCursorRow()).toBe(1);
      expect(terminal.getLine(0).trimEnd()).toBe('HI');
    });

    it('should scroll when reaching the bottom', () => {
      // Fill all 24 rows
      for (let row = 0; row < ROWS; row++) {
        terminal.putChar(0x30 + (row % 10)); // digit
        terminal.putChar(0x0d); // CR
      }
      // The 24th row's CR (row index 23) scrolls once: line 0 ('0') gone.

      // One more line causes another scroll
      terminal.putChar(0x58); // 'X'
      terminal.putChar(0x0d);
      // Second scroll: line 0 ('1') also gone.

      // Line 0 now shows what was originally row 2
      const line0 = terminal.getLine(0);
      expect(line0[0]).toBe('2'); // was row 2
    });
  });
});

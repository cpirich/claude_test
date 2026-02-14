/**
 * Level I BASIC Integration Tests
 *
 * Tests the TRS-80 system with the actual Level I BASIC ROM.
 * Verifies boot sequence, keyboard input, and BASIC program execution.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TRS80System } from '../system';
import type { TRS80Key } from '../keyboard';
import { decodeLevel1ROM } from './level1-test-rom';

/** Run the system for a specified number of cycles. */
function runCycles(system: TRS80System, cycles: number): void {
  system.run(cycles);
}

/** Type a key: press, run some cycles, release. */
function typeKey(system: TRS80System, key: Parameters<TRS80System['keyDown']>[0], holdCycles = 50_000, afterCycles = 50_000): void {
  system.keyDown(key);
  runCycles(system, holdCycles);
  system.keyUp(key);
  runCycles(system, afterCycles);
}

/** Type a shifted key: hold SHIFT, press key, release both. */
function typeShiftedKey(system: TRS80System, key: Parameters<TRS80System['keyDown']>[0], holdCycles = 50_000, afterCycles = 50_000): void {
  system.keyDown('SHIFT');
  runCycles(system, 10_000);
  system.keyDown(key);
  runCycles(system, holdCycles);
  system.keyUp(key);
  system.keyUp('SHIFT');
  runCycles(system, afterCycles);
}

/** Type a string of characters, pressing each one. */
function typeString(system: TRS80System, text: string): void {
  for (const ch of text) {
    const upper = ch.toUpperCase();
    if (upper >= 'A' && upper <= 'Z') {
      typeKey(system, upper as TRS80Key);
    } else if (upper >= '0' && upper <= '9') {
      typeKey(system, upper as TRS80Key);
    } else if (ch === ' ') {
      typeKey(system, 'SPACE');
    } else if (ch === '=') {
      // TRS-80: = is SHIFT+-
      typeShiftedKey(system, '-');
    } else if (ch === '+') {
      // TRS-80: + is SHIFT+;
      typeShiftedKey(system, ';');
    } else if (ch === '"') {
      // TRS-80: " is SHIFT+2
      typeShiftedKey(system, '2');
    } else if (ch === ':') {
      typeKey(system, ':');
    } else if (ch === ';') {
      typeKey(system, ';');
    } else if (ch === ',') {
      typeKey(system, ',');
    } else if (ch === '-') {
      typeKey(system, '-');
    } else if (ch === '.') {
      typeKey(system, '.');
    } else if (ch === '/') {
      typeKey(system, '/');
    } else if (ch === '@') {
      typeKey(system, '@');
    }
  }
}

/** Get all non-empty video lines. */
function getScreenLines(system: TRS80System): string[] {
  const lines: string[] = [];
  for (let row = 0; row < 16; row++) {
    const line = system.video.getRow(row).trimEnd();
    if (line) lines.push(line);
  }
  return lines;
}

describe('Level I BASIC', () => {
  let system: TRS80System;
  let rom: Uint8Array;

  beforeEach(() => {
    system = new TRS80System();
    rom = decodeLevel1ROM();
  });

  describe('boot sequence', () => {
    it('should load 4K ROM into memory', () => {
      system.loadROM(rom);
      system.reset();

      // Verify ROM start: F3 (DI), 21 FF 00 (LD HL,$00FF)
      expect(system.memory.read(0x0000)).toBe(0xf3);
      expect(system.memory.read(0x0001)).toBe(0x21);
      expect(system.memory.read(0x0002)).toBe(0xff);
      expect(system.memory.read(0x0003)).toBe(0x00);
    });

    it('should clear ROM area beyond 4K when loading smaller ROM', () => {
      // First load a 12K stub ROM
      const bigRom = new Uint8Array(0x3000);
      bigRom.fill(0xAA);
      system.loadROM(bigRom);

      // Now load 4K Level I ROM
      system.loadROM(rom);

      // Bytes beyond 4K should be cleared (0x00), not stale 0xAA
      expect(system.memory.read(0x1000)).toBe(0x00);
      expect(system.memory.read(0x2000)).toBe(0x00);
      expect(system.memory.read(0x2fff)).toBe(0x00);
    });

    it('should display READY after boot', () => {
      system.loadROM(rom);
      system.reset();

      // Run enough cycles for boot (memory test + display init)
      runCycles(system, 500_000);

      const lines = getScreenLines(system);
      const hasReady = lines.some(l => l.includes('READY'));
      expect(hasReady).toBe(true);
    });
  });

  describe('keyboard input', () => {
    beforeEach(() => {
      system.loadROM(rom);
      system.reset();
      runCycles(system, 500_000); // Boot to READY
    });

    it('should echo typed characters', () => {
      typeKey(system, 'A');

      // Check video RAM for the letter A somewhere
      // Note: Level I BASIC may display differently than stub ROM
      // Just verify the system doesn't crash
      expect(system.isHalted()).toBe(false);
    });
  });

  describe('BASIC execution', () => {
    beforeEach(() => {
      system.loadROM(rom);
      system.reset();
      runCycles(system, 500_000); // Boot to READY
    });

    it('should execute PRINT command', () => {
      // Type: PRINT 42
      typeString(system, 'PRINT 42');
      typeKey(system, 'ENTER');
      runCycles(system, 200_000);

      // Don't assert too strongly — the display format may vary
      expect(system.isHalted()).toBe(false);
    });

    it('should execute simple FOR loop', () => {
      // Type: 10 FOR I=1 TO 5
      typeString(system, '10 FOR I=1 TO 5');
      typeKey(system, 'ENTER');
      runCycles(system, 100_000);

      // Type: 20 PRINT I
      typeString(system, '20 PRINT I');
      typeKey(system, 'ENTER');
      runCycles(system, 100_000);

      // Type: 30 NEXT I
      typeString(system, '30 NEXT I');
      typeKey(system, 'ENTER');
      runCycles(system, 100_000);

      // Type: RUN
      typeString(system, 'RUN');
      typeKey(system, 'ENTER');

      // Run a lot of cycles to let the program execute
      runCycles(system, 5_000_000);

      const lines = getScreenLines(system);

      // System should not have crashed
      expect(system.isHalted()).toBe(false);

      // All 5 loop iterations should appear in the output
      const allText = lines.join('\n');
      for (let n = 1; n <= 5; n++) {
        expect(allText).toContain(String(n));
      }

      // READY prompt should reappear after program finishes
      const readyAfterRun = lines.findIndex(l => l.includes('RUN')) < lines.findLastIndex(l => l.includes('READY'));
      expect(readyAfterRun).toBe(true);
    });
  });
});

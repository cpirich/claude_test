/**
 * Level II BASIC Integration Tests
 *
 * Tests the TRS-80 system with the actual Level II BASIC ROM (12K).
 * Level II BASIC enables interrupts (unlike Level I which uses DI).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TRS80System } from '../system';
import { decodeLevel2ROM } from './level2-test-rom';

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

/** Type a string of characters. */
function typeString(system: TRS80System, text: string): void {
  for (const ch of text) {
    const upper = ch.toUpperCase();
    if (upper >= 'A' && upper <= 'Z') {
      typeKey(system, upper as any);
    } else if (upper >= '0' && upper <= '9') {
      typeKey(system, upper as any);
    } else if (ch === ' ') {
      typeKey(system, 'SPACE');
    } else if (ch === '=') {
      typeShiftedKey(system, '-');
    } else if (ch === '+') {
      typeShiftedKey(system, ';');
    } else if (ch === '"') {
      typeShiftedKey(system, '2');
    } else if (ch === '*') {
      typeShiftedKey(system, ':');
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

/** Get all video rows (including empty ones). */
function getAllRows(system: TRS80System): string[] {
  const lines: string[] = [];
  for (let row = 0; row < 16; row++) {
    lines.push(system.video.getRow(row).trimEnd());
  }
  return lines;
}

describe('Level II BASIC', () => {
  let system: TRS80System;
  let rom: Uint8Array;

  beforeEach(() => {
    system = new TRS80System();
    rom = decodeLevel2ROM();
  });

  describe('boot sequence', () => {
    it('should load 12K ROM into memory', () => {
      system.loadROM(rom);
      system.reset();

      // Verify ROM start: F3 (DI), AF (XOR A), C3 74 06 (JP $0674)
      expect(system.memory.read(0x0000)).toBe(0xf3);
      expect(system.memory.read(0x0001)).toBe(0xaf);
      expect(system.memory.read(0x0002)).toBe(0xc3);
      expect(rom.length).toBe(12288); // 12K
    });

    it('should have interrupt handler at $0038', () => {
      system.loadROM(rom);
      system.reset();

      // $0038: C3 12 40 = JP $4012 (handler in RAM, set up by BASIC)
      expect(system.memory.read(0x0038)).toBe(0xc3);
      expect(system.memory.read(0x0039)).toBe(0x12);
      expect(system.memory.read(0x003a)).toBe(0x40);
    });

    it('should display MEMORY SIZE? after boot', () => {
      system.loadROM(rom);
      system.reset();

      // Level II BASIC first asks "MEMORY SIZE?"
      runCycles(system, 2_000_000);

      const lines = getScreenLines(system);
      const rows = getAllRows(system);
      console.log('Level II boot — screen:');
      rows.forEach((l, i) => console.log(`  Row ${i}: "${l}"`));

      const hasMemorySize = lines.some(l => l.includes('MEMORY SIZE'));
      expect(hasMemorySize).toBe(true);
    });

    it('should reach READY after answering MEMORY SIZE?', () => {
      system.loadROM(rom);
      system.reset();

      // Boot to MEMORY SIZE? prompt
      runCycles(system, 2_000_000);

      // Press ENTER to accept default memory size
      typeKey(system, 'ENTER');
      runCycles(system, 2_000_000);

      const lines = getScreenLines(system);
      const rows = getAllRows(system);
      console.log('Level II after ENTER — screen:');
      rows.forEach((l, i) => console.log(`  Row ${i}: "${l}"`));

      const hasReady = lines.some(l => l.includes('READY'));
      expect(hasReady).toBe(true);
    });
  });

  describe('FOR loop execution', () => {
    /** Boot Level II BASIC to READY prompt. */
    function bootToReady(): void {
      system.loadROM(rom);
      system.reset();
      runCycles(system, 2_000_000); // Boot to MEMORY SIZE?
      typeKey(system, 'ENTER');      // Accept default
      runCycles(system, 2_000_000); // Wait for READY
    }

    it('should execute FOR loop with all iterations', () => {
      bootToReady();

      // Type program
      typeString(system, '10 FOR I=1 TO 5');
      typeKey(system, 'ENTER');
      runCycles(system, 200_000);

      typeString(system, '20 PRINT I');
      typeKey(system, 'ENTER');
      runCycles(system, 200_000);

      typeString(system, '30 NEXT I');
      typeKey(system, 'ENTER');
      runCycles(system, 200_000);

      typeString(system, 'RUN');
      typeKey(system, 'ENTER');
      runCycles(system, 10_000_000);

      const rows = getAllRows(system);
      console.log('Level II FOR loop — screen:');
      rows.forEach((l, i) => console.log(`  Row ${i}: "${l}"`));

      const allText = rows.join('\n');

      // System should not crash
      expect(system.isHalted()).toBe(false);

      // All 5 numbers should appear
      for (let n = 1; n <= 5; n++) {
        expect(allText).toContain(String(n));
      }

      // READY should appear after RUN
      const runIdx = rows.findIndex(l => l.includes('RUN'));
      const readyIdx = rows.findLastIndex(l => l.includes('READY'));
      expect(readyIdx).toBeGreaterThan(runIdx);
    });
  });
});

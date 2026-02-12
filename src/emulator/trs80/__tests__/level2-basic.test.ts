/**
 * Level II BASIC Integration Tests
 *
 * Tests the TRS-80 system with the actual Level II BASIC ROM (12K).
 * Level II BASIC enables interrupts (unlike Level I which uses DI).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TRS80System } from '../system';
import type { TRS80Key } from '../keyboard';
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
      typeKey(system, upper as TRS80Key);
    } else if (upper >= '0' && upper <= '9') {
      typeKey(system, upper as TRS80Key);
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
      // Level II BASIC does a memory test after MEMORY SIZE? — needs many cycles
      runCycles(system, 10_000_000);

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
      runCycles(system, 2_000_000);  // Boot to MEMORY SIZE?
      typeKey(system, 'ENTER');       // Accept default
      runCycles(system, 10_000_000); // Memory test + initialization to READY
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

    it('should execute FOR loop with expressions (I*I)', () => {
      bootToReady();

      // Type program from bug report: PRINT I*I
      typeString(system, '10 FOR I=1 TO 5');
      typeKey(system, 'ENTER');
      runCycles(system, 200_000);

      typeString(system, '20 PRINT I*I');
      typeKey(system, 'ENTER');
      runCycles(system, 200_000);

      typeString(system, '30 NEXT I');
      typeKey(system, 'ENTER');
      runCycles(system, 200_000);

      typeString(system, 'RUN');
      typeKey(system, 'ENTER');
      runCycles(system, 10_000_000);

      const rows = getAllRows(system);
      console.log('Level II FOR I*I — screen:');
      rows.forEach((l, i) => console.log(`  Row ${i}: "${l}"`));

      const allText = rows.join('\n');

      expect(system.isHalted()).toBe(false);

      // Should print squares: 1, 4, 9, 16, 25
      expect(allText).toContain('1');
      expect(allText).toContain('4');
      expect(allText).toContain('9');
      expect(allText).toContain('16');
      expect(allText).toContain('25');

      // READY should appear after program ends
      const runIdx = rows.findIndex(l => l.includes('RUN'));
      const readyIdx = rows.findLastIndex(l => l.includes('READY'));
      expect(readyIdx).toBeGreaterThan(runIdx);
    });

    it('should complete FOR loop with frame-by-frame execution (browser pattern)', () => {
      // Simulate how the browser runs: ~29,567 cycles per frame at 60fps
      // This is the pattern used by useTrs80.ts via requestAnimationFrame
      const CYCLES_PER_FRAME = Math.round(1_774_000 / 60); // 29567

      system.loadROM(rom);
      system.reset();

      // Boot: run frames until MEMORY SIZE? appears
      for (let f = 0; f < 200; f++) system.run(CYCLES_PER_FRAME);

      // Type ENTER for MEMORY SIZE?
      system.keyDown('ENTER');
      for (let f = 0; f < 5; f++) system.run(CYCLES_PER_FRAME);
      system.keyUp('ENTER');

      // Wait for READY (memory test takes many frames)
      for (let f = 0; f < 600; f++) system.run(CYCLES_PER_FRAME);

      // Verify READY appeared
      const lines = getScreenLines(system);
      const hasReady = lines.some(l => l.includes('READY'));
      console.log('Frame-by-frame boot — READY:', hasReady);

      // Type program line by line using browser-like timing
      // Each key: hold for ~3 frames (50ms at 60fps), release, wait ~3 frames
      const typeKeyFrames = (key: Parameters<typeof system.keyDown>[0]) => {
        system.keyDown(key);
        for (let f = 0; f < 3; f++) system.run(CYCLES_PER_FRAME);
        system.keyUp(key);
        for (let f = 0; f < 3; f++) system.run(CYCLES_PER_FRAME);
      };

      const typeShiftedKeyFrames = (key: Parameters<typeof system.keyDown>[0]) => {
        system.keyDown('SHIFT');
        system.run(CYCLES_PER_FRAME);
        system.keyDown(key);
        for (let f = 0; f < 3; f++) system.run(CYCLES_PER_FRAME);
        system.keyUp(key);
        system.keyUp('SHIFT');
        for (let f = 0; f < 3; f++) system.run(CYCLES_PER_FRAME);
      };

      const typeStringFrames = (text: string) => {
        for (const ch of text) {
          const upper = ch.toUpperCase();
          if (upper >= 'A' && upper <= 'Z') typeKeyFrames(upper as TRS80Key);
          else if (upper >= '0' && upper <= '9') typeKeyFrames(upper as TRS80Key);
          else if (ch === ' ') typeKeyFrames('SPACE');
          else if (ch === '=') typeShiftedKeyFrames('-');
          else if (ch === '*') typeShiftedKeyFrames(':');
          else if (ch === '+') typeShiftedKeyFrames(';');
          else if (ch === '"') typeShiftedKeyFrames('2');
        }
      };

      // 10 FOR I=1 TO 5
      typeStringFrames('10 FOR I=1 TO 5');
      typeKeyFrames('ENTER');
      for (let f = 0; f < 10; f++) system.run(CYCLES_PER_FRAME);

      // 20 PRINT I*I
      typeStringFrames('20 PRINT I*I');
      typeKeyFrames('ENTER');
      for (let f = 0; f < 10; f++) system.run(CYCLES_PER_FRAME);

      // 30 NEXT I
      typeStringFrames('30 NEXT I');
      typeKeyFrames('ENTER');
      for (let f = 0; f < 10; f++) system.run(CYCLES_PER_FRAME);

      // RUN
      typeStringFrames('RUN');
      typeKeyFrames('ENTER');

      // Let it run for several seconds worth of frames
      for (let f = 0; f < 300; f++) system.run(CYCLES_PER_FRAME);

      const rows = getAllRows(system);
      console.log('Frame-by-frame FOR I*I — screen:');
      rows.forEach((l, i) => console.log(`  Row ${i}: "${l}"`));

      const allText = rows.join('\n');
      expect(system.isHalted()).toBe(false);

      // Should print squares: 1, 4, 9, 16, 25
      expect(allText).toContain('1');
      expect(allText).toContain('4');
      expect(allText).toContain('9');
      expect(allText).toContain('16');
      expect(allText).toContain('25');

      // READY should appear after program ends
      const runIdx = rows.findIndex(l => l.includes('RUN'));
      const readyIdx = rows.findLastIndex(l => l.includes('READY'));
      expect(readyIdx).toBeGreaterThan(runIdx);
    });

    it('should handle typeCommand timing (keyDown+keyUp between frames)', () => {
      // This test reproduces the EXACT browser typeCommand pattern:
      // - keyDown fires via setTimeout (between animation frames)
      // - keyUp fires via setTimeout 15ms later (also between frames)
      // - NO CPU cycles execute between keyDown and keyUp
      // - CPU only advances during requestAnimationFrame (1 frame = 29,567 cycles)
      //
      // With MIN_HOLD_CYCLES too low, the key vanishes from the matrix before
      // the interrupt-driven keyboard scan fires, and keystrokes are lost.
      const CYCLES_PER_FRAME = Math.round(1_774_000 / 60); // 29567

      system.loadROM(rom);
      system.reset();

      // Boot to MEMORY SIZE?
      for (let f = 0; f < 200; f++) system.run(CYCLES_PER_FRAME);

      // Press ENTER between frames (no CPU between down and up)
      system.keyDown('ENTER');
      system.keyUp('ENTER');
      for (let f = 0; f < 5; f++) system.run(CYCLES_PER_FRAME);

      // Wait for READY
      for (let f = 0; f < 600; f++) system.run(CYCLES_PER_FRAME);

      // Simulate typeCommand: keyDown + keyUp with NO CPU between them,
      // then run ~3 frames (50ms / 16.67ms ≈ 3 frames) before next char
      const typeKeyBrowser = (key: Parameters<typeof system.keyDown>[0]) => {
        system.keyDown(key);
        system.keyUp(key); // Both fire between frames — no CPU execution between them
        for (let f = 0; f < 3; f++) system.run(CYCLES_PER_FRAME);
      };

      const typeShiftedKeyBrowser = (key: Parameters<typeof system.keyDown>[0]) => {
        system.keyDown('SHIFT');
        system.keyDown(key);
        system.keyUp(key);
        system.keyUp('SHIFT');
        for (let f = 0; f < 3; f++) system.run(CYCLES_PER_FRAME);
      };

      const typeStringBrowser = (text: string) => {
        for (const ch of text) {
          const upper = ch.toUpperCase();
          if (upper >= 'A' && upper <= 'Z') typeKeyBrowser(upper as TRS80Key);
          else if (upper >= '0' && upper <= '9') typeKeyBrowser(upper as TRS80Key);
          else if (ch === ' ') typeKeyBrowser('SPACE');
          else if (ch === '=') typeShiftedKeyBrowser('-');
          else if (ch === '*') typeShiftedKeyBrowser(':');
          else if (ch === '+') typeShiftedKeyBrowser(';');
          else if (ch === '"') typeShiftedKeyBrowser('2');
        }
      };

      // Type: 10 FOR I=1 TO 5
      typeStringBrowser('10 FOR I=1 TO 5');
      typeKeyBrowser('ENTER');
      for (let f = 0; f < 10; f++) system.run(CYCLES_PER_FRAME);

      // Type: 20 PRINT I
      typeStringBrowser('20 PRINT I');
      typeKeyBrowser('ENTER');
      for (let f = 0; f < 10; f++) system.run(CYCLES_PER_FRAME);

      // Type: 30 NEXT I
      typeStringBrowser('30 NEXT I');
      typeKeyBrowser('ENTER');
      for (let f = 0; f < 10; f++) system.run(CYCLES_PER_FRAME);

      // Type: RUN
      typeStringBrowser('RUN');
      typeKeyBrowser('ENTER');

      // Let the program run
      for (let f = 0; f < 300; f++) system.run(CYCLES_PER_FRAME);

      const rows = getAllRows(system);
      console.log('typeCommand timing test — screen:');
      rows.forEach((l, i) => console.log(`  Row ${i}: "${l}"`));

      const allText = rows.join('\n');
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

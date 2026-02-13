import { describe, it, expect, beforeEach } from 'vitest';
import { TRS80Memory } from '../memory';
import { TRS80Keyboard } from '../keyboard';
import { TRS80Video } from '../video';

describe('TRS80Memory', () => {
  let memory: TRS80Memory;
  let keyboard: TRS80Keyboard;
  let video: TRS80Video;

  beforeEach(() => {
    keyboard = new TRS80Keyboard();
    video = new TRS80Video();
    memory = new TRS80Memory(keyboard, video);
  });

  describe('ROM area ($0000-$2FFF)', () => {
    it('should return 0 when no ROM is loaded', () => {
      expect(memory.read(0x0000)).toBe(0);
      expect(memory.read(0x1000)).toBe(0);
      expect(memory.read(0x2fff)).toBe(0);
    });

    it('should return loaded ROM data', () => {
      const rom = new Uint8Array(0x3000);
      rom[0] = 0xc3;  // JP instruction
      rom[1] = 0x00;
      rom[2] = 0x01;  // JP $0100
      rom[0x2fff] = 0x76; // HALT

      memory.loadROM(rom);

      expect(memory.read(0x0000)).toBe(0xc3);
      expect(memory.read(0x0001)).toBe(0x00);
      expect(memory.read(0x0002)).toBe(0x01);
      expect(memory.read(0x2fff)).toBe(0x76);
    });

    it('should be read-only (writes ignored)', () => {
      const rom = new Uint8Array(0x3000);
      rom[0] = 0xc3;
      memory.loadROM(rom);

      memory.write(0x0000, 0x00);
      expect(memory.read(0x0000)).toBe(0xc3);
    });

    it('should handle ROMs smaller than 12K', () => {
      const smallRom = new Uint8Array(256);
      smallRom[0] = 0xab;
      memory.loadROM(smallRom);

      expect(memory.read(0x0000)).toBe(0xab);
      expect(memory.read(0x0100)).toBe(0); // Beyond loaded ROM
    });
  });

  describe('unused ROM area ($3000-$37FF)', () => {
    it('should return $FF', () => {
      expect(memory.read(0x3000)).toBe(0xff);
      expect(memory.read(0x3400)).toBe(0xff);
      expect(memory.read(0x37ff)).toBe(0xff);
    });

    it('should ignore writes', () => {
      memory.write(0x3000, 0x42);
      expect(memory.read(0x3000)).toBe(0xff);
    });
  });

  describe('keyboard area ($3800-$3BFF)', () => {
    it('should route reads to keyboard', () => {
      keyboard.keyDown('A');
      expect(memory.read(0x3801)).toBe(0x02); // 'A' = row 0, bit 1
    });

    it('should be read-only (writes ignored)', () => {
      memory.write(0x3801, 0xff);
      expect(memory.read(0x3801)).toBe(0); // No keys pressed
    });

    it('should route mirrored addresses to keyboard', () => {
      keyboard.keyDown('ENTER');
      expect(memory.read(0x3840)).toBe(0x01);
      expect(memory.read(0x3940)).toBe(0x01); // Mirror
    });
  });

  describe('video RAM ($3C00-$3FFF)', () => {
    it('should route reads to video', () => {
      video.write(0x3c00, 0x41);
      expect(memory.read(0x3c00)).toBe(0x41);
    });

    it('should route writes to video', () => {
      memory.write(0x3c00, 0x42);
      expect(video.read(0x3c00)).toBe(0x42);
    });

    it('should handle full video RAM range', () => {
      memory.write(0x3c00, 0x48);
      memory.write(0x3fff, 0x49);
      expect(memory.read(0x3c00)).toBe(0x48);
      expect(memory.read(0x3fff)).toBe(0x49);
    });

    it('should trigger video change callback', () => {
      const changes: number[] = [];
      video.setOnChange((addr) => changes.push(addr));

      memory.write(0x3c00, 0x41);
      memory.write(0x3c01, 0x42);

      expect(changes).toEqual([0x3c00, 0x3c01]);
    });
  });

  describe('user RAM ($4000-$FFFF)', () => {
    it('should store and retrieve values', () => {
      memory.write(0x4000, 0x41);
      expect(memory.read(0x4000)).toBe(0x41);
    });

    it('should handle the full RAM range', () => {
      memory.write(0x4000, 0x01); // First byte
      memory.write(0xffff, 0x02); // Last byte
      expect(memory.read(0x4000)).toBe(0x01);
      expect(memory.read(0xffff)).toBe(0x02);
    });

    it('should initialize to zeros', () => {
      expect(memory.read(0x4000)).toBe(0);
      expect(memory.read(0x8000)).toBe(0);
      expect(memory.read(0xffff)).toBe(0);
    });

    it('should mask values to 8 bits', () => {
      memory.write(0x4000, 0x1ff);
      expect(memory.read(0x4000)).toBe(0xff);
    });
  });

  describe('address wrapping', () => {
    it('should mask addresses to 16 bits', () => {
      memory.write(0x14000, 0x42); // Same as $4000
      expect(memory.read(0x4000)).toBe(0x42);
    });
  });

  describe('peekRAM/pokeRAM', () => {
    it('should read/write RAM directly', () => {
      memory.pokeRAM(0x4000, 0x42);
      expect(memory.peekRAM(0x4000)).toBe(0x42);
    });

    it('should return 0 for addresses outside RAM', () => {
      expect(memory.peekRAM(0x0000)).toBe(0);
      expect(memory.peekRAM(0x3c00)).toBe(0);
    });
  });

  describe('peekROM', () => {
    it('should read ROM directly', () => {
      const rom = new Uint8Array(0x3000);
      rom[0x100] = 0xab;
      memory.loadROM(rom);
      expect(memory.peekROM(0x100)).toBe(0xab);
    });

    it('should return 0 for addresses outside ROM', () => {
      expect(memory.peekROM(0x3000)).toBe(0);
    });
  });

  describe('full system routing', () => {
    it('should correctly route across all regions', () => {
      // Load ROM
      const rom = new Uint8Array(0x3000);
      rom[0] = 0xaa;
      memory.loadROM(rom);

      // Set up keyboard
      keyboard.keyDown('A');

      // Write video RAM
      memory.write(0x3c00, 0x41);

      // Write user RAM
      memory.write(0x4000, 0xbb);

      // Verify all regions
      expect(memory.read(0x0000)).toBe(0xaa);   // ROM
      expect(memory.read(0x3000)).toBe(0xff);    // Unused
      expect(memory.read(0x3801)).toBe(0x02);    // Keyboard
      expect(memory.read(0x3c00)).toBe(0x41);    // Video
      expect(memory.read(0x4000)).toBe(0xbb);    // RAM
    });
  });
});

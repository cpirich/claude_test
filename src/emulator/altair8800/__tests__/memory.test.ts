import { describe, it, expect, beforeEach } from 'vitest';
import { AltairMemory } from '../memory';

describe('AltairMemory', () => {
  let memory: AltairMemory;

  beforeEach(() => {
    memory = new AltairMemory();
  });

  describe('basic read/write', () => {
    it('should initialize to all zeros', () => {
      expect(memory.read(0x0000)).toBe(0);
      expect(memory.read(0x8000)).toBe(0);
      expect(memory.read(0xffff)).toBe(0);
    });

    it('should read back written values', () => {
      memory.write(0x0000, 0x42);
      memory.write(0x8000, 0xab);
      memory.write(0xffff, 0xff);

      expect(memory.read(0x0000)).toBe(0x42);
      expect(memory.read(0x8000)).toBe(0xab);
      expect(memory.read(0xffff)).toBe(0xff);
    });

    it('should mask address to 16 bits', () => {
      memory.write(0x10042, 0x55);
      expect(memory.read(0x0042)).toBe(0x55);
    });

    it('should mask value to 8 bits', () => {
      memory.write(0x0000, 0x1ff);
      expect(memory.read(0x0000)).toBe(0xff);
    });
  });

  describe('full address range', () => {
    it('should support all 64K addresses', () => {
      // Write distinctive values at boundaries
      memory.write(0x0000, 0x01);
      memory.write(0x3fff, 0x02);
      memory.write(0x4000, 0x03);
      memory.write(0x7fff, 0x04);
      memory.write(0xbfff, 0x05);
      memory.write(0xffff, 0x06);

      expect(memory.read(0x0000)).toBe(0x01);
      expect(memory.read(0x3fff)).toBe(0x02);
      expect(memory.read(0x4000)).toBe(0x03);
      expect(memory.read(0x7fff)).toBe(0x04);
      expect(memory.read(0xbfff)).toBe(0x05);
      expect(memory.read(0xffff)).toBe(0x06);
    });
  });

  describe('loadBytes', () => {
    it('should load a block of bytes at the given address', () => {
      const data = new Uint8Array([0x10, 0x20, 0x30, 0x40]);
      memory.loadBytes(0x100, data);

      expect(memory.read(0x100)).toBe(0x10);
      expect(memory.read(0x101)).toBe(0x20);
      expect(memory.read(0x102)).toBe(0x30);
      expect(memory.read(0x103)).toBe(0x40);
    });

    it('should handle wrapping at address boundary', () => {
      const data = new Uint8Array([0xaa, 0xbb]);
      memory.loadBytes(0xffff, data);

      expect(memory.read(0xffff)).toBe(0xaa);
      expect(memory.read(0x0000)).toBe(0xbb);
    });
  });

  describe('loadSoftwareEntry', () => {
    it('should load all regions from a software entry', () => {
      const entry = {
        id: 'test',
        name: 'Test',
        description: '',
        category: 'utility' as const,
        regions: [
          { startAddress: 0x0000, data: new Uint8Array([0x11, 0x22]) },
          { startAddress: 0x1000, data: new Uint8Array([0x33, 0x44]) },
        ],
        entryPoint: 0x0000,
        author: 'Test',
        sizeBytes: 4,
        addressRange: '$0000',
        isStub: false,
      };

      memory.loadSoftwareEntry(entry);

      expect(memory.read(0x0000)).toBe(0x11);
      expect(memory.read(0x0001)).toBe(0x22);
      expect(memory.read(0x1000)).toBe(0x33);
      expect(memory.read(0x1001)).toBe(0x44);
    });
  });

  describe('clear', () => {
    it('should clear all RAM to zero', () => {
      memory.write(0x0000, 0xff);
      memory.write(0x8000, 0xff);
      memory.write(0xffff, 0xff);

      memory.clear();

      expect(memory.read(0x0000)).toBe(0);
      expect(memory.read(0x8000)).toBe(0);
      expect(memory.read(0xffff)).toBe(0);
    });
  });

  describe('peek/poke', () => {
    it('peek should read without side effects', () => {
      memory.write(0x1234, 0xab);
      expect(memory.peek(0x1234)).toBe(0xab);
    });

    it('poke should write directly', () => {
      memory.poke(0x5678, 0xcd);
      expect(memory.read(0x5678)).toBe(0xcd);
    });
  });
});

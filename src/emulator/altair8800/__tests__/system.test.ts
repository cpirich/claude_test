import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Altair8800System } from '../system';
import type { SoftwareEntry } from '@/emulator/apple1/software-library';

describe('Altair8800System', () => {
  let system: Altair8800System;

  beforeEach(() => {
    system = new Altair8800System();
  });

  describe('construction', () => {
    it('should create all subsystems', () => {
      expect(system.cpu).toBeDefined();
      expect(system.memory).toBeDefined();
      expect(system.serial).toBeDefined();
      expect(system.panel).toBeDefined();
    });

    it('should start not running', () => {
      expect(system.isRunning()).toBe(false);
      expect(system.isHalted()).toBe(false);
    });

    it('should start at PC=0', () => {
      expect(system.getPC()).toBe(0);
    });
  });

  describe('reset', () => {
    it('should reset all subsystems', () => {
      // Modify state
      system.cpu.pc = 0x1234;
      system.panel.running = true;
      system.serial.sendInput(0x41);

      system.reset();

      expect(system.cpu.pc).toBe(0);
      expect(system.panel.running).toBe(false);
      expect(system.serial.hasInput()).toBe(false);
    });
  });

  describe('run', () => {
    it('should not run when panel is stopped', () => {
      // Load NOPs
      system.memory.write(0x0000, 0x00);
      const cycles = system.run(100);
      expect(cycles).toBe(0);
    });

    it('should execute cycles when panel is running', () => {
      // Load NOPs then HLT
      for (let i = 0; i < 10; i++) {
        system.memory.write(i, 0x00); // NOP
      }
      system.memory.write(10, 0x76); // HLT

      system.panel.run();
      const cycles = system.run(1000);

      expect(cycles).toBeGreaterThan(0);
      expect(system.cpu.pc).toBeGreaterThan(0);
    });

    it('should stop when CPU halts', () => {
      system.memory.write(0x0000, 0x76); // HLT at address 0
      system.panel.run();

      system.run(100);

      expect(system.isHalted()).toBe(true);
      expect(system.isRunning()).toBe(false);
    });
  });

  describe('loadSoftware', () => {
    it('should load regions into memory and set PC', () => {
      const entry: SoftwareEntry = {
        id: 'test',
        name: 'Test Program',
        description: 'Test',
        category: 'utility',
        regions: [
          { startAddress: 0x0100, data: new Uint8Array([0x3e, 0x42, 0x76]) },
        ],
        entryPoint: 0x0100,
        author: 'Test',
        sizeBytes: 3,
        addressRange: '$0100-$0102',
        isStub: false,
      };

      system.loadSoftware(entry);

      expect(system.memory.read(0x0100)).toBe(0x3e);
      expect(system.memory.read(0x0101)).toBe(0x42);
      expect(system.memory.read(0x0102)).toBe(0x76);
      expect(system.cpu.pc).toBe(0x0100);
    });

    it('should not change state for empty regions', () => {
      const entry: SoftwareEntry = {
        id: 'empty',
        name: 'Empty',
        description: '',
        category: 'utility',
        regions: [],
        entryPoint: 0x0100,
        author: 'Test',
        sizeBytes: 0,
        addressRange: '',
        isStub: false,
      };

      system.cpu.pc = 0x5678;
      system.loadSoftware(entry);

      // PC should not change for empty regions
      expect(system.cpu.pc).toBe(0x5678);
    });
  });

  describe('serial I/O', () => {
    it('should route output callback through system', () => {
      const callback = vi.fn();
      system.setSerialOutputCallback(callback);

      system.serial.out(0x11, 0x48); // 'H'
      expect(callback).toHaveBeenCalledWith(0x48);
    });

    it('should accept serial input through system', () => {
      system.serialInput(0x41); // 'A'
      expect(system.serial.hasInput()).toBe(true);
      expect(system.serial.in(0x11)).toBe(0x41);
    });

    it('should accept serial string input', () => {
      system.serialInputString('AB');
      expect(system.serial.in(0x11)).toBe(0x41); // 'A'
      expect(system.serial.in(0x11)).toBe(0x42); // 'B'
    });
  });

  describe('front panel integration', () => {
    it('should support examine/deposit workflow', () => {
      system.panel.addressSwitches = 0x0000;
      system.panel.examine();

      system.panel.dataSwitches = 0x3e; // MVI A
      system.panel.deposit();

      system.panel.dataSwitches = 0x42; // 0x42
      system.panel.depositNext();

      system.panel.dataSwitches = 0x76; // HLT
      system.panel.depositNext();

      // Verify memory contents
      expect(system.memory.read(0x0000)).toBe(0x3e);
      expect(system.memory.read(0x0001)).toBe(0x42);
      expect(system.memory.read(0x0002)).toBe(0x76);

      // Reset and run the program
      system.panel.addressSwitches = 0x0000;
      system.panel.examine();
      system.panel.run();
      system.run(100);

      // Should have executed and halted
      expect(system.isHalted()).toBe(true);
    });
  });

  describe('getCycles', () => {
    it('should track total elapsed cycles', () => {
      expect(system.getCycles()).toBe(0);

      // Run a NOP
      system.memory.write(0x0000, 0x00); // NOP
      system.memory.write(0x0001, 0x76); // HLT
      system.panel.run();
      system.run(100);

      expect(system.getCycles()).toBeGreaterThan(0);
    });
  });
});

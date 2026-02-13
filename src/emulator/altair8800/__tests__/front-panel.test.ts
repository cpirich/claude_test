import { describe, it, expect, beforeEach } from 'vitest';
import { AltairFrontPanel, STATUS_MEMR, STATUS_M1, STATUS_HLTA, STATUS_WO } from '../front-panel';
import { AltairMemory } from '../memory';
import { I8080 } from '@/cpu/i8080';
import { Altair2SIO } from '../serial';

describe('AltairFrontPanel', () => {
  let panel: AltairFrontPanel;
  let memory: AltairMemory;
  let cpu: I8080;
  let serial: Altair2SIO;

  beforeEach(() => {
    memory = new AltairMemory();
    serial = new Altair2SIO();
    cpu = new I8080(memory, serial);
    panel = new AltairFrontPanel();
    panel.connect(cpu, memory);
  });

  describe('initial state', () => {
    it('should start with all switches at 0', () => {
      expect(panel.addressSwitches).toBe(0);
      expect(panel.dataSwitches).toBe(0);
    });

    it('should start with all LEDs at 0', () => {
      expect(panel.addressLEDs).toBe(0);
      expect(panel.dataLEDs).toBe(0);
      expect(panel.statusLEDs).toBe(0);
    });

    it('should start not running', () => {
      expect(panel.running).toBe(false);
    });
  });

  describe('examine', () => {
    it('should set PC to address switches and read memory', () => {
      memory.write(0x1234, 0xab);
      panel.addressSwitches = 0x1234;

      panel.examine();

      expect(cpu.pc).toBe(0x1234);
      expect(panel.addressLEDs).toBe(0x1234);
      expect(panel.dataLEDs).toBe(0xab);
    });

    it('should set MEMR, M1, and WO status LEDs', () => {
      panel.examine();
      expect(panel.statusLEDs & STATUS_MEMR).toBeTruthy();
      expect(panel.statusLEDs & STATUS_M1).toBeTruthy();
      expect(panel.statusLEDs & STATUS_WO).toBeTruthy();
    });
  });

  describe('examineNext', () => {
    it('should increment PC and read next address', () => {
      memory.write(0x0100, 0x11);
      memory.write(0x0101, 0x22);

      panel.addressSwitches = 0x0100;
      panel.examine();
      expect(panel.dataLEDs).toBe(0x11);

      panel.examineNext();
      expect(cpu.pc).toBe(0x0101);
      expect(panel.addressLEDs).toBe(0x0101);
      expect(panel.dataLEDs).toBe(0x22);
    });

    it('should wrap around at 0xFFFF', () => {
      cpu.pc = 0xffff;
      panel.examineNext();
      expect(cpu.pc).toBe(0x0000);
      expect(panel.addressLEDs).toBe(0x0000);
    });
  });

  describe('deposit', () => {
    it('should write data switches into memory at current PC', () => {
      panel.addressSwitches = 0x0200;
      panel.examine(); // Set PC to 0x0200
      panel.dataSwitches = 0x55;

      panel.deposit();

      expect(memory.read(0x0200)).toBe(0x55);
      expect(panel.dataLEDs).toBe(0x55);
      expect(panel.addressLEDs).toBe(0x0200);
    });
  });

  describe('depositNext', () => {
    it('should increment PC then write data switches', () => {
      panel.addressSwitches = 0x0300;
      panel.examine(); // Set PC to 0x0300
      panel.dataSwitches = 0xaa;
      panel.deposit(); // Write 0xaa at 0x0300

      panel.dataSwitches = 0xbb;
      panel.depositNext(); // Increment to 0x0301, write 0xbb

      expect(cpu.pc).toBe(0x0301);
      expect(memory.read(0x0300)).toBe(0xaa);
      expect(memory.read(0x0301)).toBe(0xbb);
    });
  });

  describe('run/stop', () => {
    it('should set running to true on run()', () => {
      panel.run();
      expect(panel.running).toBe(true);
    });

    it('should set running to false on stop()', () => {
      panel.run();
      panel.stop();
      expect(panel.running).toBe(false);
    });

    it('should unhalt the CPU on run()', () => {
      cpu.halted = true;
      panel.run();
      expect(cpu.halted).toBe(false);
    });
  });

  describe('singleStep', () => {
    it('should execute one instruction and stop', () => {
      // Load NOP at address 0
      memory.write(0x0000, 0x00); // NOP
      cpu.pc = 0x0000;

      panel.singleStep();

      expect(panel.running).toBe(false);
      expect(cpu.pc).toBe(0x0001); // Advanced past NOP
    });

    it('should update LEDs after step', () => {
      memory.write(0x0000, 0x00); // NOP
      memory.write(0x0001, 0x76); // HLT at next address
      cpu.pc = 0x0000;

      panel.singleStep();

      expect(panel.addressLEDs).toBe(cpu.pc);
    });
  });

  describe('reset', () => {
    it('should reset CPU and stop execution', () => {
      cpu.pc = 0x1234;
      panel.running = true;

      panel.reset();

      expect(cpu.pc).toBe(0x0000);
      expect(panel.running).toBe(false);
    });
  });

  describe('updateLEDs', () => {
    it('should reflect CPU state in LEDs', () => {
      cpu.pc = 0x4567;
      memory.write(0x4567, 0xde);

      panel.updateLEDs();

      expect(panel.addressLEDs).toBe(0x4567);
      expect(panel.dataLEDs).toBe(0xde);
    });

    it('should set HLTA status when CPU is halted', () => {
      cpu.halted = true;
      panel.updateLEDs();
      expect(panel.statusLEDs & STATUS_HLTA).toBeTruthy();
    });
  });

  describe('switch manipulation', () => {
    it('should set and clear individual address switches', () => {
      panel.setAddressSwitch(0, true);
      expect(panel.addressSwitches).toBe(0x0001);

      panel.setAddressSwitch(15, true);
      expect(panel.addressSwitches).toBe(0x8001);

      panel.setAddressSwitch(0, false);
      expect(panel.addressSwitches).toBe(0x8000);
    });

    it('should toggle address switches', () => {
      panel.toggleAddressSwitch(8);
      expect(panel.addressSwitches).toBe(0x0100);

      panel.toggleAddressSwitch(8);
      expect(panel.addressSwitches).toBe(0x0000);
    });

    it('should set and clear individual data switches', () => {
      panel.setDataSwitch(0, true);
      expect(panel.dataSwitches).toBe(0x01);

      panel.setDataSwitch(7, true);
      expect(panel.dataSwitches).toBe(0x81);

      panel.setDataSwitch(0, false);
      expect(panel.dataSwitches).toBe(0x80);
    });

    it('should toggle data switches', () => {
      panel.toggleDataSwitch(4);
      expect(panel.dataSwitches).toBe(0x10);

      panel.toggleDataSwitch(4);
      expect(panel.dataSwitches).toBe(0x00);
    });

    it('should ignore out-of-range switch operations', () => {
      panel.setAddressSwitch(-1, true);
      panel.setAddressSwitch(16, true);
      expect(panel.addressSwitches).toBe(0);

      panel.setDataSwitch(-1, true);
      panel.setDataSwitch(8, true);
      expect(panel.dataSwitches).toBe(0);
    });
  });

  describe('getState', () => {
    it('should return a snapshot of panel state', () => {
      panel.addressSwitches = 0x1234;
      panel.dataSwitches = 0x56;
      panel.addressLEDs = 0x7890;
      panel.dataLEDs = 0xab;
      panel.running = true;

      const state = panel.getState();
      expect(state.addressSwitches).toBe(0x1234);
      expect(state.dataSwitches).toBe(0x56);
      expect(state.addressLEDs).toBe(0x7890);
      expect(state.dataLEDs).toBe(0xab);
      expect(state.running).toBe(true);
    });
  });

  describe('front panel programming workflow', () => {
    it('should support entering a program via EXAMINE/DEPOSIT', () => {
      // Enter a simple program: MVI A, 42h; HLT
      // 0x3E 0x42 0x76

      // Set address to 0x0000
      panel.addressSwitches = 0x0000;
      panel.examine();

      // Deposit first byte (MVI A opcode)
      panel.dataSwitches = 0x3e;
      panel.deposit();
      expect(memory.read(0x0000)).toBe(0x3e);

      // Deposit next byte (immediate value)
      panel.dataSwitches = 0x42;
      panel.depositNext();
      expect(memory.read(0x0001)).toBe(0x42);

      // Deposit next byte (HLT)
      panel.dataSwitches = 0x76;
      panel.depositNext();
      expect(memory.read(0x0002)).toBe(0x76);

      // Verify the program is in memory
      panel.addressSwitches = 0x0000;
      panel.examine();
      expect(panel.dataLEDs).toBe(0x3e);

      panel.examineNext();
      expect(panel.dataLEDs).toBe(0x42);

      panel.examineNext();
      expect(panel.dataLEDs).toBe(0x76);
    });
  });
});

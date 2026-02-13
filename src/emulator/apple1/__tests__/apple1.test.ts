import { Apple1 } from '../apple1';
import type { SoftwareEntry } from '../software-library';

describe('Apple I System', () => {
  let apple1: Apple1;

  beforeEach(() => {
    apple1 = new Apple1();
    apple1.reset();
  });

  describe('loadSoftware', () => {
    it('clears terminal when loading a ROM-replacement program', () => {
      // Put some text on the screen
      apple1.keyPress(0x41); // 'A'
      apple1.run(100);

      const romProgram: SoftwareEntry = {
        id: 'test-rom',
        name: 'Test ROM',
        description: 'Test ROM replacement',
        category: 'diagnostic',
        regions: [
          {
            startAddress: 0xff00,
            data: new Uint8Array([0xd8, 0x58, 0xa0, 0x7f]), // Sample ROM code
          },
        ],
        entryPoint: 0xff00,
        author: 'Test',
        sizeBytes: 4,
        addressRange: '$FF00-$FF03',
        isStub: false,
      };

      apple1.loadSoftware(romProgram);

      // Terminal should be cleared
      const lines = apple1.getTerminalLines();
      for (const line of lines) {
        expect(line.trim()).toBe('');
      }
    });

    it('clears terminal when loading a RAM-based program', () => {
      // Put some text on the screen
      apple1.keyPress(0x41); // 'A'
      apple1.run(100);

      // Verify there's something on the screen
      let hasContent = false;
      for (const line of apple1.getTerminalLines()) {
        if (line.trim() !== '') {
          hasContent = true;
          break;
        }
      }
      expect(hasContent).toBe(true);

      const ramProgram: SoftwareEntry = {
        id: 'test-ram',
        name: 'Test RAM Program',
        description: 'Test RAM program',
        category: 'demo',
        regions: [
          {
            startAddress: 0x0280,
            data: new Uint8Array([0xa9, 0x41, 0x8d, 0x12, 0xd0]), // Sample code
          },
        ],
        entryPoint: 0x0280,
        author: 'Test',
        sizeBytes: 5,
        addressRange: '$0280-$0284',
        isStub: false,
      };

      apple1.loadSoftware(ramProgram);

      // Terminal should be cleared
      const lines = apple1.getTerminalLines();
      for (const line of lines) {
        expect(line.trim()).toBe('');
      }
    });

    it('does nothing for entries with no regions', () => {
      const emptyEntry: SoftwareEntry = {
        id: 'woz-monitor',
        name: 'Woz Monitor',
        description: 'Built-in monitor',
        category: 'utility',
        regions: [],
        entryPoint: 0xff00,
        author: 'Woz',
        sizeBytes: 0,
        addressRange: '',
        isStub: false,
      };

      // Should not throw
      expect(() => apple1.loadSoftware(emptyEntry)).not.toThrow();
    });

    it('sets correct PC for RAM programs', () => {
      const ramProgram: SoftwareEntry = {
        id: 'test-ram',
        name: 'Test RAM Program',
        description: 'Test RAM program',
        category: 'demo',
        regions: [
          {
            startAddress: 0x0300,
            data: new Uint8Array([0xa9, 0x00]), // LDA #$00
          },
        ],
        entryPoint: 0x0300,
        author: 'Test',
        sizeBytes: 2,
        addressRange: '$0300-$0301',
        isStub: false,
      };

      apple1.loadSoftware(ramProgram);

      expect(apple1.cpu.pc).toBe(0x0300);
    });

    it('resets CPU for ROM-replacement programs', () => {
      const romProgram: SoftwareEntry = {
        id: 'test-rom',
        name: 'Test ROM',
        description: 'Test ROM replacement',
        category: 'diagnostic',
        regions: [
          {
            startAddress: 0xff00,
            data: new Uint8Array(256).fill(0xea), // Fill with NOPs
          },
          {
            startAddress: 0xfffc,
            data: new Uint8Array([0x00, 0xff]), // Reset vector points to $FF00
          },
        ],
        entryPoint: 0xff00,
        author: 'Test',
        sizeBytes: 258,
        addressRange: '$FF00-$FFFF',
        isStub: false,
      };

      apple1.loadSoftware(romProgram);

      // After reset, PC should be loaded from reset vector at $FFFC-$FFFD
      expect(apple1.cpu.pc).toBe(0xff00);
    });
  });
});

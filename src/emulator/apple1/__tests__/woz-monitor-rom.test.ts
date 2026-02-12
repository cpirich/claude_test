import { WozMonitorROM } from '../woz-monitor-rom';

describe('Woz Monitor ROM', () => {
  let rom: WozMonitorROM;

  beforeEach(() => {
    rom = new WozMonitorROM();
  });

  describe('address range', () => {
    it('recognizes $FF00-$FFFF as ROM addresses', () => {
      expect(WozMonitorROM.inRange(0xff00)).toBe(true);
      expect(WozMonitorROM.inRange(0xff80)).toBe(true);
      expect(WozMonitorROM.inRange(0xffff)).toBe(true);
    });

    it('rejects addresses outside ROM range', () => {
      expect(WozMonitorROM.inRange(0xfeff)).toBe(false);
      expect(WozMonitorROM.inRange(0x0000)).toBe(false);
      expect(WozMonitorROM.inRange(0xd010)).toBe(false);
    });
  });

  describe('ROM properties', () => {
    it('has 256 bytes', () => {
      expect(rom.size).toBe(256);
    });

    it('has base address $FF00', () => {
      expect(rom.baseAddress).toBe(0xff00);
    });
  });

  describe('reset vector', () => {
    it('points to $FF00 (start of Woz Monitor)', () => {
      expect(rom.resetVector).toBe(0xff00);
    });

    it('is stored at $FFFC-$FFFD in little-endian', () => {
      expect(rom.read(0xfffc)).toBe(0x00); // low byte
      expect(rom.read(0xfffd)).toBe(0xff); // high byte
    });
  });

  describe('NMI vector', () => {
    it('points to $0F00', () => {
      expect(rom.nmiVector).toBe(0x0f00);
    });

    it('is stored at $FFFA-$FFFB in little-endian', () => {
      expect(rom.read(0xfffa)).toBe(0x00); // low byte
      expect(rom.read(0xfffb)).toBe(0x0f); // high byte
    });
  });

  describe('IRQ vector', () => {
    it('points to $0000', () => {
      expect(rom.irqVector).toBe(0x0000);
    });

    it('is stored at $FFFE-$FFFF in little-endian', () => {
      expect(rom.read(0xfffe)).toBe(0x00); // low byte
      expect(rom.read(0xffff)).toBe(0x00); // high byte
    });
  });

  describe('first instructions (RESET entry point)', () => {
    it('starts with CLD ($D8)', () => {
      expect(rom.read(0xff00)).toBe(0xd8);
    });

    it('follows with CLI ($58)', () => {
      expect(rom.read(0xff01)).toBe(0x58);
    });

    it('loads Y with $7F (LDY #$7F)', () => {
      expect(rom.read(0xff02)).toBe(0xa0); // LDY immediate
      expect(rom.read(0xff03)).toBe(0x7f); // #$7F
    });

    it('stores to DSP register at $D012 (STY $D012)', () => {
      expect(rom.read(0xff04)).toBe(0x8c); // STY absolute
      expect(rom.read(0xff05)).toBe(0x12); // low byte of $D012
      expect(rom.read(0xff06)).toBe(0xd0); // high byte of $D012
    });
  });

  describe('ECHO subroutine at $FFEF', () => {
    it('starts with BIT $D012 (check display ready)', () => {
      expect(rom.read(0xffef)).toBe(0x2c); // BIT absolute
      expect(rom.read(0xfff0)).toBe(0x12); // low byte of $D012
      expect(rom.read(0xfff1)).toBe(0xd0); // high byte of $D012
    });

    it('loops with BMI (wait for display ready)', () => {
      expect(rom.read(0xfff2)).toBe(0x30); // BMI
      expect(rom.read(0xfff3)).toBe(0xfb); // relative offset (-5, back to ECHO)
    });

    it('writes to DSP and returns (STA $D012, RTS)', () => {
      expect(rom.read(0xfff4)).toBe(0x8d); // STA absolute
      expect(rom.read(0xfff5)).toBe(0x12); // low byte
      expect(rom.read(0xfff6)).toBe(0xd0); // high byte
      expect(rom.read(0xfff7)).toBe(0x60); // RTS
    });
  });

  describe('PRBYTE subroutine at $FFDC', () => {
    it('pushes A, shifts right 4 times for high nibble', () => {
      expect(rom.read(0xffdc)).toBe(0x48); // PHA
      expect(rom.read(0xffdd)).toBe(0x4a); // LSR A
      expect(rom.read(0xffde)).toBe(0x4a); // LSR A
      expect(rom.read(0xffdf)).toBe(0x4a); // LSR A
      expect(rom.read(0xffe0)).toBe(0x4a); // LSR A
    });

    it('calls PRHEX for high nibble (JSR $FFE5)', () => {
      expect(rom.read(0xffe1)).toBe(0x20); // JSR
      expect(rom.read(0xffe2)).toBe(0xe5); // low byte
      expect(rom.read(0xffe3)).toBe(0xff); // high byte
    });
  });

  describe('ROM data integrity', () => {
    it('all 256 bytes are readable', () => {
      for (let addr = 0xff00; addr <= 0xffff; addr++) {
        const value = rom.read(addr);
        expect(value).toBeGreaterThanOrEqual(0x00);
        expect(value).toBeLessThanOrEqual(0xff);
      }
    });

    it('ROM checksum matches expected value', () => {
      let sum = 0;
      for (let addr = 0xff00; addr <= 0xffff; addr++) {
        sum = (sum + rom.read(addr)) & 0xffff;
      }
      // Pre-computed checksum of the authentic Woz Monitor
      expect(sum).toBe(
        WOZ_MONITOR_BYTES_CHECKSUM
      );
    });
  });
});

// Pre-compute expected checksum for the test
const WOZ_MONITOR_BYTES_CHECKSUM = (() => {
  const rom = new WozMonitorROM();
  let sum = 0;
  for (let addr = 0xff00; addr <= 0xffff; addr++) {
    sum = (sum + rom.read(addr)) & 0xffff;
  }
  return sum;
})();

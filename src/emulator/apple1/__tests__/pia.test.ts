import { PIA } from '../pia';

describe('PIA (6821) I/O', () => {
  let pia: PIA;

  beforeEach(() => {
    pia = new PIA();
  });

  describe('address range', () => {
    it('recognizes $D010-$D013 as PIA addresses', () => {
      expect(PIA.inRange(0xd010)).toBe(true);
      expect(PIA.inRange(0xd011)).toBe(true);
      expect(PIA.inRange(0xd012)).toBe(true);
      expect(PIA.inRange(0xd013)).toBe(true);
    });

    it('rejects addresses outside PIA range', () => {
      expect(PIA.inRange(0xd00f)).toBe(false);
      expect(PIA.inRange(0xd014)).toBe(false);
      expect(PIA.inRange(0x0000)).toBe(false);
      expect(PIA.inRange(0xffff)).toBe(false);
    });
  });

  describe('keyboard input (KBD $D010, KBDCR $D011)', () => {
    it('starts with no key available', () => {
      expect(pia.hasKey()).toBe(false);
      expect(pia.read(0xd011)).toBe(0x00); // KBDCR bit 7 clear
    });

    it('sets key data with bit 7 high on keyPress', () => {
      pia.keyPress(0x41); // 'A'
      // KBD should have 'A' with bit 7 set = 0xC1
      expect(pia.read(0xd010)).toBe(0xc1);
    });

    it('sets KBDCR bit 7 when key is pressed', () => {
      pia.keyPress(0x41);
      expect(pia.hasKey()).toBe(true);
      expect(pia.read(0xd011) & 0x80).toBe(0x80);
    });

    it('clears KBDCR bit 7 when KBD is read', () => {
      pia.keyPress(0x41);
      expect(pia.hasKey()).toBe(true);

      pia.read(0xd010); // Reading KBD clears KBDCR bit 7
      expect(pia.hasKey()).toBe(false);
      expect(pia.read(0xd011) & 0x80).toBe(0x00);
    });

    it('preserves key data after KBDCR bit 7 is cleared', () => {
      pia.keyPress(0x41);
      const firstRead = pia.read(0xd010);
      expect(firstRead).toBe(0xc1);

      // Key data remains even after flag is cleared
      const secondRead = pia.read(0xd010);
      expect(secondRead).toBe(0xc1);
    });

    it('handles sequential key presses', () => {
      pia.keyPress(0x48); // 'H'
      expect(pia.read(0xd010)).toBe(0xc8);

      pia.keyPress(0x49); // 'I'
      expect(pia.hasKey()).toBe(true);
      expect(pia.read(0xd010)).toBe(0xc9);
    });

    it('masks input to 7 bits before setting bit 7', () => {
      pia.keyPress(0xff); // High bit should be stripped, then re-set
      expect(pia.read(0xd010)).toBe(0xff); // 0x7F | 0x80
    });

    it('ignores writes to KBD and KBDCR', () => {
      pia.keyPress(0x41);
      pia.write(0xd010, 0x00); // Should be ignored
      pia.write(0xd011, 0x00); // Should be ignored
      expect(pia.read(0xd010)).toBe(0xc1);
      // KBDCR bit 7 was cleared by the read above, but the key data persists
    });
  });

  describe('display output (DSP $D012, DSPCR $D013)', () => {
    it('reports display always ready (DSPCR bit 7 set)', () => {
      expect(pia.read(0xd013) & 0x80).toBe(0x80);
    });

    it('calls display callback when DSP is written', () => {
      const output: number[] = [];
      pia.setDisplayOutputCallback((char) => output.push(char));

      pia.write(0xd012, 0xc1); // 'A' with bit 7 set (as Woz Monitor does)
      expect(output).toEqual([0x41]); // Low 7 bits = 'A'
    });

    it('clears DSP bit 7 after write (character accepted)', () => {
      pia.write(0xd012, 0xc1);
      expect(pia.read(0xd012) & 0x80).toBe(0x00);
    });

    it('outputs multiple characters', () => {
      const output: number[] = [];
      pia.setDisplayOutputCallback((char) => output.push(char));

      // "HI" with bit 7 set on each
      pia.write(0xd012, 0xc8); // 'H'
      pia.write(0xd012, 0xc9); // 'I'
      expect(output).toEqual([0x48, 0x49]);
    });

    it('handles CR character ($8D -> $0D)', () => {
      const output: number[] = [];
      pia.setDisplayOutputCallback((char) => output.push(char));

      pia.write(0xd012, 0x8d); // CR with bit 7 set
      expect(output).toEqual([0x0d]);
    });

    it('stores DSPCR writes', () => {
      pia.write(0xd013, 0x27); // Woz Monitor init value
      // Bit 7 is always set on read (display ready)
      expect(pia.read(0xd013)).toBe(0xa7);
    });
  });

  describe('reset', () => {
    it('clears all registers on reset', () => {
      pia.keyPress(0x41);
      pia.write(0xd012, 0xc1);
      pia.write(0xd013, 0x27);

      pia.reset();

      expect(pia.read(0xd010)).toBe(0x00);
      expect(pia.read(0xd011)).toBe(0x00);
      expect(pia.read(0xd012)).toBe(0x00);
      // DSPCR bit 7 is always set (display ready), even after reset
      expect(pia.read(0xd013) & 0x80).toBe(0x80);
      expect(pia.hasKey()).toBe(false);
    });
  });

  describe('integration scenarios', () => {
    it('simulates Woz Monitor keyboard polling loop', () => {
      // The Woz Monitor polls KBDCR bit 7 in a tight loop:
      //   NOTCR: ...
      //   NEXTCHAR: LDA KBDCR   ; Key ready?
      //             BPL NEXTCHAR ; Loop until bit 7 set
      //             LDA KBD     ; Read the key

      // No key yet — bit 7 clear
      expect(pia.read(0xd011) & 0x80).toBe(0x00); // BPL would branch

      // User presses 'A'
      pia.keyPress(0x41);
      expect(pia.read(0xd011) & 0x80).toBe(0x80); // BPL falls through

      // Read the key
      const key = pia.read(0xd010);
      expect(key).toBe(0xc1); // 'A' | 0x80
      expect(key & 0x7f).toBe(0x41); // Strip bit 7 to get ASCII

      // KBDCR bit 7 now clear (key consumed)
      expect(pia.read(0xd011) & 0x80).toBe(0x00);
    });

    it('simulates Woz Monitor display output sequence', () => {
      // The Woz Monitor outputs a character like this:
      //   ECHO: BIT DSP       ; Test display ready (bit 7 of DSP via N flag)
      //         BMI ECHO      ; Loop until ready
      //         STA DSP       ; Write character

      const output: number[] = [];
      pia.setDisplayOutputCallback((char) => output.push(char));

      // Check display ready — DSPCR bit 7 is always set
      expect(pia.read(0xd013) & 0x80).toBe(0x80);

      // Actually, Woz Monitor checks DSP bit 7 (not DSPCR)
      // After reset, DSP bit 7 should be clear (ready)
      expect(pia.read(0xd012) & 0x80).toBe(0x00); // BMI falls through

      // Write 'A' with bit 7 set (accumulator value from keyboard has bit 7)
      pia.write(0xd012, 0xc1);
      expect(output).toEqual([0x41]);

      // DSP bit 7 cleared after write (ready for next char)
      expect(pia.read(0xd012) & 0x80).toBe(0x00);
    });
  });
});

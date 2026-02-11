import { describe, it, expect, beforeEach } from 'vitest';
import { TRS80Keyboard } from '../keyboard';

describe('TRS80Keyboard', () => {
  let kb: TRS80Keyboard;

  beforeEach(() => {
    kb = new TRS80Keyboard();
  });

  describe('address range', () => {
    it('should recognize $3800-$3BFF as keyboard addresses', () => {
      expect(TRS80Keyboard.inRange(0x3800)).toBe(true);
      expect(TRS80Keyboard.inRange(0x3801)).toBe(true);
      expect(TRS80Keyboard.inRange(0x3bff)).toBe(true);
    });

    it('should reject addresses outside keyboard range', () => {
      expect(TRS80Keyboard.inRange(0x37ff)).toBe(false);
      expect(TRS80Keyboard.inRange(0x3c00)).toBe(false);
      expect(TRS80Keyboard.inRange(0x0000)).toBe(false);
    });

    it('should include mirrored range $3900-$3BFF', () => {
      expect(TRS80Keyboard.inRange(0x3900)).toBe(true);
      expect(TRS80Keyboard.inRange(0x3a00)).toBe(true);
    });
  });

  describe('no keys pressed', () => {
    it('should return 0 for all row addresses', () => {
      expect(kb.read(0x3801)).toBe(0);
      expect(kb.read(0x3802)).toBe(0);
      expect(kb.read(0x3804)).toBe(0);
      expect(kb.read(0x3808)).toBe(0);
      expect(kb.read(0x3810)).toBe(0);
      expect(kb.read(0x3820)).toBe(0);
      expect(kb.read(0x3840)).toBe(0);
      expect(kb.read(0x3880)).toBe(0);
    });

    it('should return 0 for base address $3800', () => {
      expect(kb.read(0x3800)).toBe(0);
    });
  });

  describe('single key press/release', () => {
    it('should detect A key in row 0', () => {
      kb.keyDown('A');
      expect(kb.read(0x3801)).toBe(0x02); // bit 1
      expect(kb.isKeyDown('A')).toBe(true);
    });

    it('should release key after keyUp + hold timer expiry via tick', () => {
      kb.keyDown('A');
      expect(kb.read(0x3801)).toBe(0x02);

      // Release physically, but hold timer keeps it in matrix
      kb.keyUp('A');
      expect(kb.read(0x3801)).toBe(0x02); // Still held by timer

      // Advance past hold time — now both timer expired and physical released
      kb.tick(6000);
      expect(kb.read(0x3801)).toBe(0); // Released from matrix
    });

    it('should detect @ in row 0 bit 0', () => {
      kb.keyDown('@');
      expect(kb.read(0x3801)).toBe(0x01); // bit 0
    });

    it('should detect G in row 0 bit 7', () => {
      kb.keyDown('G');
      expect(kb.read(0x3801)).toBe(0x80); // bit 7
    });

    it('should detect H in row 1', () => {
      kb.keyDown('H');
      expect(kb.read(0x3802)).toBe(0x01); // bit 0 of row 1
    });

    it('should detect O in row 1 bit 7', () => {
      kb.keyDown('O');
      expect(kb.read(0x3802)).toBe(0x80);
    });

    it('should detect ENTER in row 6', () => {
      kb.keyDown('ENTER');
      expect(kb.read(0x3840)).toBe(0x01);
    });

    it('should detect SPACE in row 6 bit 7', () => {
      kb.keyDown('SPACE');
      expect(kb.read(0x3840)).toBe(0x80);
    });

    it('should detect SHIFT in row 7', () => {
      kb.keyDown('SHIFT');
      expect(kb.read(0x3880)).toBe(0x01);
    });

    it('should detect digit 0 in row 4', () => {
      kb.keyDown('0');
      expect(kb.read(0x3810)).toBe(0x01);
    });
  });

  describe('simultaneous keys', () => {
    it('should show multiple keys in matrix simultaneously', () => {
      kb.keyDown('A'); // row 0, bit 1
      kb.keyDown('C'); // row 0, bit 3

      // Both keys should be in matrix at the same time
      expect(kb.read(0x3801)).toBe(0x02 | 0x08); // A + C
    });

    it('should show keys across different rows simultaneously', () => {
      kb.keyDown('H'); // row 1, bit 0
      kb.keyDown('I'); // row 1, bit 1
      kb.keyDown('A'); // row 0, bit 1

      expect(kb.read(0x3802)).toBe(0x01 | 0x02); // H + I in row 1
      expect(kb.read(0x3801)).toBe(0x02);          // A in row 0
    });
  });

  describe('multi-row scanning', () => {
    it('should return 0 when no relevant row has keys', () => {
      kb.keyDown('A'); // row 0
      expect(kb.read(0x3802)).toBe(0); // only row 1 selected
    });

    it('should scan active key with $38FF', () => {
      kb.keyDown('A'); // row 0, bit 1
      expect(kb.read(0x38ff)).toBe(0x02); // bit 1
    });
  });

  describe('address mirroring', () => {
    it('should mirror $3901 to $3801 (same row select)', () => {
      kb.keyDown('A');
      expect(kb.read(0x3901)).toBe(kb.read(0x3801));
    });

    it('should mirror across the full $3800-$3BFF range', () => {
      kb.keyDown('SPACE');
      // $3840, $3940, $3A40, $3B40 should all return the same
      const expected = kb.read(0x3840);
      expect(kb.read(0x3940)).toBe(expected);
      expect(kb.read(0x3a40)).toBe(expected);
      expect(kb.read(0x3b40)).toBe(expected);
    });
  });

  describe('reset', () => {
    it('should release all keys and clear timers', () => {
      kb.keyDown('A');
      kb.keyDown('B');
      kb.keyDown('C');
      kb.reset();

      for (let row = 0; row < 8; row++) {
        expect(kb.getRow(row)).toBe(0);
      }
    });
  });

  describe('arrow keys', () => {
    it('should detect arrow keys in row 6', () => {
      kb.keyDown('UP');
      expect(kb.read(0x3840)).toBe(0x08); // bit 3

      // Release UP: keyUp + tick past hold timer
      kb.keyUp('UP');
      kb.tick(6000);
      expect(kb.read(0x3840)).toBe(0); // UP released

      kb.keyDown('DOWN');
      expect(kb.read(0x3840)).toBe(0x10); // bit 4
    });
  });

  describe('hold timer behavior', () => {
    it('key stays in matrix during hold period after keyUp', () => {
      kb.keyDown('A');
      kb.keyUp('A'); // Physical release, but hold timer active

      // Partial tick — not enough to expire timer
      kb.tick(2000);
      expect(kb.read(0x3801)).toBe(0x02); // Still held by timer

      kb.tick(2000);
      expect(kb.read(0x3801)).toBe(0x02); // Still held by timer

      kb.tick(2000); // Now past MIN_HOLD_CYCLES (5600)
      expect(kb.read(0x3801)).toBe(0); // Timer expired + physical released → cleared
    });

    it('key persists in matrix while physically held even after timer', () => {
      kb.keyDown('A');

      // Timer expires but key still physically held
      kb.tick(6000);
      expect(kb.read(0x3801)).toBe(0x02); // Still active — physical overrides

      // Now release physically
      kb.keyUp('A');
      // Timer already expired, so keyUp clears immediately
      expect(kb.read(0x3801)).toBe(0);
    });

    it('keyUp on active key preserves matrix bit until timer expires', () => {
      kb.keyDown('A');
      expect(kb.read(0x3801)).toBe(0x02);

      kb.keyUp('A'); // Physical released, but timer holds it
      expect(kb.read(0x3801)).toBe(0x02); // Still in matrix
    });

    it('new key after full release is immediately visible', () => {
      kb.keyDown('A');
      kb.keyUp('A');
      kb.tick(6000); // Timer expired + physical released → A cleared

      // New key should show up immediately
      kb.keyDown('B');
      expect(kb.read(0x3801)).toBe(0x04); // B = bit 2, no A
    });
  });

  describe('punctuation keys', () => {
    it('should detect colon in row 5', () => {
      kb.keyDown(':');
      expect(kb.read(0x3820)).toBe(0x04); // bit 2
    });

    it('should detect slash in row 5', () => {
      kb.keyDown('/');
      expect(kb.read(0x3820)).toBe(0x80); // bit 7
    });
  });
});

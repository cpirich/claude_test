import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Altair2SIO } from '../serial';

describe('Altair2SIO', () => {
  let serial: Altair2SIO;

  beforeEach(() => {
    serial = new Altair2SIO();
  });

  describe('status register (port 0x10)', () => {
    it('should report TX buffer empty (bit 1) always set', () => {
      const status = serial.in(0x10);
      expect(status & 0x02).toBe(0x02);
    });

    it('should report RX data not ready when input buffer is empty', () => {
      const status = serial.in(0x10);
      expect(status & 0x01).toBe(0x00);
    });

    it('should report RX data ready when input is available', () => {
      serial.sendInput(0x41); // 'A'
      const status = serial.in(0x10);
      expect(status & 0x01).toBe(0x01);
    });

    it('should report not ready after all input consumed', () => {
      serial.sendInput(0x41);
      serial.in(0x11); // Consume the character
      const status = serial.in(0x10);
      expect(status & 0x01).toBe(0x00);
    });
  });

  describe('data register (port 0x11)', () => {
    it('should return 0x00 when no input available', () => {
      expect(serial.in(0x11)).toBe(0x00);
    });

    it('should return queued input characters in FIFO order', () => {
      serial.sendInput(0x41); // 'A'
      serial.sendInput(0x42); // 'B'
      serial.sendInput(0x43); // 'C'

      expect(serial.in(0x11)).toBe(0x41);
      expect(serial.in(0x11)).toBe(0x42);
      expect(serial.in(0x11)).toBe(0x43);
    });

    it('should mask input to 7-bit ASCII', () => {
      serial.sendInput(0xff);
      expect(serial.in(0x11)).toBe(0x7f);
    });
  });

  describe('output', () => {
    it('should call output callback on data write', () => {
      const callback = vi.fn();
      serial.setOutputCallback(callback);

      serial.out(0x11, 0x48); // 'H'
      expect(callback).toHaveBeenCalledWith(0x48);
    });

    it('should mask output to 7-bit ASCII', () => {
      const callback = vi.fn();
      serial.setOutputCallback(callback);

      serial.out(0x11, 0xff);
      expect(callback).toHaveBeenCalledWith(0x7f);
    });

    it('should not throw when no callback registered', () => {
      expect(() => serial.out(0x11, 0x41)).not.toThrow();
    });
  });

  describe('sendString', () => {
    it('should queue all characters from a string', () => {
      serial.sendString('Hi');
      expect(serial.in(0x11)).toBe(0x48); // 'H'
      expect(serial.in(0x11)).toBe(0x69); // 'i'
    });
  });

  describe('hasInput', () => {
    it('should return false when buffer is empty', () => {
      expect(serial.hasInput()).toBe(false);
    });

    it('should return true when input is queued', () => {
      serial.sendInput(0x41);
      expect(serial.hasInput()).toBe(true);
    });
  });

  describe('reset', () => {
    it('should clear the input buffer', () => {
      serial.sendInput(0x41);
      serial.sendInput(0x42);
      serial.reset();

      expect(serial.hasInput()).toBe(false);
      expect(serial.in(0x10) & 0x01).toBe(0x00);
    });
  });

  describe('other ports', () => {
    it('should return 0xFF for unhandled input ports', () => {
      expect(serial.in(0x00)).toBe(0xff);
      expect(serial.in(0x20)).toBe(0xff);
      expect(serial.in(0xff)).toBe(0xff);
    });

    it('should ignore writes to unhandled ports', () => {
      expect(() => serial.out(0x00, 0x42)).not.toThrow();
      expect(() => serial.out(0x20, 0x42)).not.toThrow();
    });
  });

  describe('control register write (port 0x10)', () => {
    it('should accept control writes without error', () => {
      expect(() => serial.out(0x10, 0x03)).not.toThrow(); // Master reset
      expect(() => serial.out(0x10, 0x15)).not.toThrow(); // 8N1 config
    });
  });

  describe('pendingInputCount', () => {
    it('should track pending input count', () => {
      expect(serial.pendingInputCount).toBe(0);
      serial.sendInput(0x41);
      serial.sendInput(0x42);
      expect(serial.pendingInputCount).toBe(2);
      serial.in(0x11); // consume one
      expect(serial.pendingInputCount).toBe(1);
    });
  });
});

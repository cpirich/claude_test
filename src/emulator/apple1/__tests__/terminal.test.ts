import { Terminal, COLS, ROWS } from '../terminal';

describe('Apple I Terminal', () => {
  let terminal: Terminal;

  beforeEach(() => {
    terminal = new Terminal();
  });

  describe('dimensions', () => {
    it('is 40 columns wide', () => {
      expect(COLS).toBe(40);
    });

    it('is 24 rows tall', () => {
      expect(ROWS).toBe(24);
    });
  });

  describe('initial state', () => {
    it('starts with cursor at top-left (0, 0)', () => {
      expect(terminal.getCursorCol()).toBe(0);
      expect(terminal.getCursorRow()).toBe(0);
    });

    it('starts with empty screen', () => {
      const lines = terminal.getLines();
      expect(lines).toHaveLength(ROWS);
      for (const line of lines) {
        expect(line).toBe(' '.repeat(COLS));
      }
    });
  });

  describe('character output', () => {
    it('places a character at cursor position', () => {
      terminal.putChar(0x41); // 'A'
      expect(terminal.getLine(0).charAt(0)).toBe('A');
      expect(terminal.getCursorCol()).toBe(1);
    });

    it('advances cursor after each character', () => {
      terminal.putChar(0x48); // 'H'
      terminal.putChar(0x49); // 'I'
      expect(terminal.getCursorCol()).toBe(2);
      expect(terminal.getLine(0).substring(0, 2)).toBe('HI');
    });

    it('outputs uppercase letters', () => {
      // Type "HELLO"
      const hello = [0x48, 0x45, 0x4c, 0x4c, 0x4f];
      for (const ch of hello) terminal.putChar(ch);
      expect(terminal.getLine(0).substring(0, 5)).toBe('HELLO');
    });

    it('outputs digits', () => {
      // '0' through '9'
      for (let ch = 0x30; ch <= 0x39; ch++) terminal.putChar(ch);
      expect(terminal.getLine(0).substring(0, 10)).toBe('0123456789');
    });

    it('outputs space character ($20)', () => {
      terminal.putChar(0x41); // 'A'
      terminal.putChar(0x20); // space
      terminal.putChar(0x42); // 'B'
      expect(terminal.getLine(0).substring(0, 3)).toBe('A B');
    });

    it('outputs symbols in the printable range', () => {
      // Colon $3A, used by Woz Monitor in address display
      terminal.putChar(0x3a); // ':'
      expect(terminal.getLine(0).charAt(0)).toBe(':');

      // Backslash $5C, used by Woz Monitor for line cancel display
      terminal.putChar(0x5c); // '\'
      expect(terminal.getLine(0).charAt(1)).toBe('\\');
    });

    it('handles the full printable range ($20-$5F)', () => {
      // All 64 printable characters
      for (let ch = 0x20; ch <= 0x5f; ch++) {
        terminal.putChar(ch);
      }
      // First 40 on row 0, remaining 24 on row 1
      expect(terminal.getCursorRow()).toBe(1);
      expect(terminal.getCursorCol()).toBe(24);
    });
  });

  describe('non-printable characters', () => {
    it('ignores characters below $20 (except CR)', () => {
      terminal.putChar(0x00);
      terminal.putChar(0x07); // BEL
      terminal.putChar(0x0a); // LF
      terminal.putChar(0x1f);
      expect(terminal.getCursorCol()).toBe(0);
      expect(terminal.getCursorRow()).toBe(0);
    });

    it('ignores characters above $5F', () => {
      terminal.putChar(0x60); // backtick
      terminal.putChar(0x61); // lowercase 'a'
      terminal.putChar(0x7f); // DEL
      expect(terminal.getCursorCol()).toBe(0);
      expect(terminal.getCursorRow()).toBe(0);
    });
  });

  describe('carriage return ($0D)', () => {
    it('moves cursor to column 0 of next row', () => {
      terminal.putChar(0x41); // 'A'
      terminal.putChar(0x42); // 'B'
      terminal.putChar(0x0d); // CR
      expect(terminal.getCursorCol()).toBe(0);
      expect(terminal.getCursorRow()).toBe(1);
    });

    it('preserves text on previous line', () => {
      terminal.putChar(0x41); // 'A'
      terminal.putChar(0x0d); // CR
      expect(terminal.getLine(0).charAt(0)).toBe('A');
    });

    it('handles multiple CRs', () => {
      terminal.putChar(0x0d);
      terminal.putChar(0x0d);
      terminal.putChar(0x0d);
      expect(terminal.getCursorRow()).toBe(3);
      expect(terminal.getCursorCol()).toBe(0);
    });
  });

  describe('line wrapping', () => {
    it('wraps to next line after 40 characters', () => {
      for (let i = 0; i < COLS; i++) {
        terminal.putChar(0x41); // 'A'
      }
      expect(terminal.getCursorCol()).toBe(0);
      expect(terminal.getCursorRow()).toBe(1);
    });

    it('continues output on wrapped line', () => {
      for (let i = 0; i < COLS; i++) {
        terminal.putChar(0x41); // 'A'
      }
      terminal.putChar(0x42); // 'B'
      expect(terminal.getLine(1).charAt(0)).toBe('B');
    });
  });

  describe('scrolling', () => {
    it('scrolls when output reaches bottom of screen', () => {
      // Fill all 24 rows
      for (let row = 0; row < ROWS; row++) {
        terminal.putChar(0x30 + (row % 10)); // digit for this row
        terminal.putChar(0x0d); // CR
      }
      // Should have scrolled — cursor on last row
      expect(terminal.getCursorRow()).toBe(ROWS - 1);
    });

    it('discards top line when scrolling', () => {
      // Put 'A' on first line
      terminal.putChar(0x41); // 'A'
      terminal.putChar(0x0d);

      // Fill remaining rows to trigger scroll
      for (let row = 1; row < ROWS; row++) {
        terminal.putChar(0x42); // 'B'
        terminal.putChar(0x0d);
      }

      // One more line triggers scroll — 'A' line should be gone
      // After scroll, what was row 1 ('B') is now row 0
      expect(terminal.getLine(0).charAt(0)).toBe('B');
    });

    it('new line at bottom is empty after scroll', () => {
      // Fill screen + one extra line to trigger scroll
      for (let row = 0; row <= ROWS; row++) {
        terminal.putChar(0x41);
        terminal.putChar(0x0d);
      }
      // The last line should be empty (we just CR'd onto it)
      expect(terminal.getLine(ROWS - 1).trim()).toBe('');
    });

    it('handles continuous scrolling', () => {
      // Output 100 lines
      for (let i = 0; i < 100; i++) {
        const digit = 0x30 + (i % 10);
        terminal.putChar(digit);
        terminal.putChar(0x0d);
      }
      // Cursor should still be on last row
      expect(terminal.getCursorRow()).toBe(ROWS - 1);
      // Screen should still have 24 lines
      expect(terminal.getLines()).toHaveLength(ROWS);
    });
  });

  describe('clear and reset', () => {
    it('clear empties the screen', () => {
      terminal.putChar(0x41);
      terminal.clear();
      expect(terminal.getLine(0).trim()).toBe('');
      expect(terminal.getCursorCol()).toBe(0);
      expect(terminal.getCursorRow()).toBe(0);
    });

    it('reset is equivalent to clear', () => {
      terminal.putChar(0x41);
      terminal.putChar(0x0d);
      terminal.putChar(0x42);
      terminal.reset();
      expect(terminal.getCursorCol()).toBe(0);
      expect(terminal.getCursorRow()).toBe(0);
      for (const line of terminal.getLines()) {
        expect(line).toBe(' '.repeat(COLS));
      }
    });
  });

  describe('getScreenContent', () => {
    it('returns 24 lines joined by newlines', () => {
      const content = terminal.getScreenContent();
      const lines = content.split('\n');
      expect(lines).toHaveLength(ROWS);
    });

    it('each line is exactly 40 characters', () => {
      terminal.putChar(0x41); // 'A'
      const content = terminal.getScreenContent();
      const lines = content.split('\n');
      for (const line of lines) {
        expect(line.length).toBe(COLS);
      }
    });

    it('includes typed characters', () => {
      terminal.putChar(0x41); // 'A'
      terminal.putChar(0x42); // 'B'
      const content = terminal.getScreenContent();
      expect(content.startsWith('AB')).toBe(true);
    });
  });

  describe('onChange callback', () => {
    it('fires on putChar', () => {
      let called = 0;
      terminal.setOnChange(() => called++);
      terminal.putChar(0x41);
      expect(called).toBe(1);
    });

    it('fires on clear', () => {
      let called = 0;
      terminal.setOnChange(() => called++);
      terminal.clear();
      expect(called).toBe(1);
    });

    it('fires for each character output', () => {
      let called = 0;
      terminal.setOnChange(() => called++);
      terminal.putChar(0x48); // H
      terminal.putChar(0x49); // I
      terminal.putChar(0x0d); // CR
      expect(called).toBe(3);
    });
  });

  describe('Woz Monitor integration scenarios', () => {
    it('displays the monitor prompt (backslash + CR)', () => {
      // The Woz Monitor outputs "\" followed by CR when line is cancelled
      terminal.putChar(0x5c); // '\'
      terminal.putChar(0x0d); // CR
      expect(terminal.getLine(0).charAt(0)).toBe('\\');
      expect(terminal.getCursorRow()).toBe(1);
      expect(terminal.getCursorCol()).toBe(0);
    });

    it('displays a hex address dump line', () => {
      // Simulates: "FF00: D8" (as the Woz Monitor would output)
      const line = 'FF00: D8';
      for (const ch of line) {
        terminal.putChar(ch.charCodeAt(0));
      }
      expect(terminal.getLine(0).substring(0, 8)).toBe('FF00: D8');
    });

    it('handles mixed input echo and output', () => {
      // User types "FF00" — monitor echoes each character
      const input = 'FF00';
      for (const ch of input) {
        terminal.putChar(ch.charCodeAt(0));
      }
      // Monitor outputs CR then address dump
      terminal.putChar(0x0d);
      const output = 'FF00: D8';
      for (const ch of output) {
        terminal.putChar(ch.charCodeAt(0));
      }
      expect(terminal.getLine(0).substring(0, 4)).toBe('FF00');
      expect(terminal.getLine(1).substring(0, 8)).toBe('FF00: D8');
    });
  });
});

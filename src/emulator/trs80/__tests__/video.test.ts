import { describe, it, expect, beforeEach } from 'vitest';
import { TRS80Video, VIDEO_BASE, VIDEO_END, VIDEO_COLS, VIDEO_ROWS, VIDEO_SIZE, trs80CharToDisplay } from '../video';

describe('TRS80Video', () => {
  let video: TRS80Video;

  beforeEach(() => {
    video = new TRS80Video();
  });

  describe('address range', () => {
    it('should recognize $3C00-$3FFF as video RAM', () => {
      expect(TRS80Video.inRange(0x3c00)).toBe(true);
      expect(TRS80Video.inRange(0x3fff)).toBe(true);
      expect(TRS80Video.inRange(0x3d00)).toBe(true);
    });

    it('should reject addresses outside video RAM', () => {
      expect(TRS80Video.inRange(0x3bff)).toBe(false);
      expect(TRS80Video.inRange(0x4000)).toBe(false);
    });
  });

  describe('read/write', () => {
    it('should store and retrieve values', () => {
      video.write(VIDEO_BASE, 0x41); // 'A'
      expect(video.read(VIDEO_BASE)).toBe(0x41);
    });

    it('should handle the full video RAM range', () => {
      video.write(VIDEO_BASE, 0x48); // First byte
      video.write(VIDEO_END, 0x49); // Last byte
      expect(video.read(VIDEO_BASE)).toBe(0x48);
      expect(video.read(VIDEO_END)).toBe(0x49);
    });

    it('should mask values to 8 bits', () => {
      video.write(VIDEO_BASE, 0x1ff);
      expect(video.read(VIDEO_BASE)).toBe(0xff);
    });

    it('should initialize to zeros', () => {
      expect(video.read(VIDEO_BASE)).toBe(0);
      expect(video.read(VIDEO_BASE + 500)).toBe(0);
    });
  });

  describe('display layout', () => {
    it('should have 64 columns and 16 rows', () => {
      expect(VIDEO_COLS).toBe(64);
      expect(VIDEO_ROWS).toBe(16);
      expect(VIDEO_SIZE).toBe(1024);
    });

    it('should map row 0 to $3C00-$3C3F', () => {
      video.write(0x3c00, 0x41); // col 0
      video.write(0x3c3f, 0x42); // col 63
      expect(video.getCharAt(0, 0)).toBe(0x41);
      expect(video.getCharAt(0, 63)).toBe(0x42);
    });

    it('should map row 1 to $3C40-$3C7F', () => {
      video.write(0x3c40, 0x43);
      expect(video.getCharAt(1, 0)).toBe(0x43);
    });

    it('should map last row to $3FC0-$3FFF', () => {
      video.write(0x3fc0, 0x44);
      expect(video.getCharAt(15, 0)).toBe(0x44);
    });

    it('should calculate address from row/col correctly', () => {
      // Row 5, Col 20 = $3C00 + 5*64 + 20 = $3C00 + 340 = $3D54
      video.write(0x3d54, 0x45);
      expect(video.getCharAt(5, 20)).toBe(0x45);
    });
  });

  describe('getScreen', () => {
    it('should return a 16×64 grid', () => {
      const screen = video.getScreen();
      expect(screen.length).toBe(VIDEO_ROWS);
      for (const row of screen) {
        expect(row.length).toBe(VIDEO_COLS);
      }
    });

    it('should reflect written values', () => {
      video.write(VIDEO_BASE, 0x48);     // 'H'
      video.write(VIDEO_BASE + 1, 0x49); // 'I'
      const screen = video.getScreen();
      expect(screen[0][0]).toBe(0x48);
      expect(screen[0][1]).toBe(0x49);
    });
  });

  describe('getScreenText', () => {
    it('should convert printable characters to string', () => {
      video.write(VIDEO_BASE, 0x48);     // 'H'
      video.write(VIDEO_BASE + 1, 0x45); // 'E'
      video.write(VIDEO_BASE + 2, 0x4c); // 'L'
      video.write(VIDEO_BASE + 3, 0x4c); // 'L'
      video.write(VIDEO_BASE + 4, 0x4f); // 'O'

      const text = video.getScreenText();
      const firstLine = text.split('\n')[0];
      expect(firstLine.startsWith('HELLO')).toBe(true);
    });

    it('should map TRS-80 character codes correctly', () => {
      video.write(VIDEO_BASE, 0x00); // $00 → @ (TRS-80 char ROM position 0)
      video.write(VIDEO_BASE + 1, 0x41); // $41 → 'A' (ASCII passthrough)
      video.write(VIDEO_BASE + 2, 0xff); // $FF → inverse of $3F = '?'
      video.write(VIDEO_BASE + 3, 0x01); // $01 → 'A' (TRS-80 char ROM position 1)
      video.write(VIDEO_BASE + 4, 0x8f); // $8F → block graphics

      const text = video.getScreenText();
      const firstLine = text.split('\n')[0];
      expect(firstLine[0]).toBe('@');  // $00 → @ (char ROM maps $00 to @)
      expect(firstLine[1]).toBe('A');  // $41 → A (standard ASCII passthrough)
      expect(firstLine[2]).toBe('?');  // $FF → inverse '?'
      expect(firstLine[3]).toBe('A');  // $01 → A (char ROM position 1 = A)
    });

    it('should have 16 lines', () => {
      const text = video.getScreenText();
      expect(text.split('\n').length).toBe(VIDEO_ROWS);
    });
  });

  describe('getRow', () => {
    it('should return a specific row as string', () => {
      video.write(VIDEO_BASE + VIDEO_COLS, 0x42); // Row 1, col 0 = 'B'
      const row1 = video.getRow(1);
      expect(row1[0]).toBe('B');
    });

    it('should pad to 64 characters', () => {
      expect(video.getRow(0).length).toBe(VIDEO_COLS);
    });

    it('should return spaces for out-of-range rows', () => {
      expect(video.getRow(-1)).toBe(' '.repeat(VIDEO_COLS));
      expect(video.getRow(16)).toBe(' '.repeat(VIDEO_COLS));
    });
  });

  describe('clear', () => {
    it('should fill with spaces ($20)', () => {
      video.write(VIDEO_BASE, 0x41);
      video.clear();
      expect(video.read(VIDEO_BASE)).toBe(0x20);
      expect(video.read(VIDEO_END)).toBe(0x20);
    });
  });

  describe('reset', () => {
    it('should fill with zeros', () => {
      video.write(VIDEO_BASE, 0x41);
      video.reset();
      expect(video.read(VIDEO_BASE)).toBe(0);
    });
  });

  describe('last write position tracking', () => {
    it('should track cursor position after write', () => {
      video.write(VIDEO_BASE + 5, 0x41); // Write at offset 5
      const pos = video.getLastWritePosition();
      expect(pos.row).toBe(0);
      expect(pos.col).toBe(6); // Next position after offset 5
    });

    it('should track position across rows', () => {
      video.write(VIDEO_BASE + 63, 0x41); // Last column of row 0
      const pos = video.getLastWritePosition();
      expect(pos.row).toBe(1);
      expect(pos.col).toBe(0); // Wraps to next row
    });

    it('should reset position on reset', () => {
      video.write(VIDEO_BASE + 100, 0x41);
      video.reset();
      const pos = video.getLastWritePosition();
      expect(pos.row).toBe(0);
      expect(pos.col).toBe(1); // Reset sets offset to 0, next = 1
    });
  });

  describe('change callback', () => {
    it('should fire callback on write', () => {
      const changes: { address: number; value: number }[] = [];
      video.setOnChange((addr, val) => changes.push({ address: addr, value: val }));

      video.write(0x3c00, 0x41);
      video.write(0x3c01, 0x42);

      expect(changes.length).toBe(2);
      expect(changes[0]).toEqual({ address: 0x3c00, value: 0x41 });
      expect(changes[1]).toEqual({ address: 0x3c01, value: 0x42 });
    });

    it('should not fire callback on read', () => {
      let called = false;
      video.setOnChange(() => { called = true; });

      video.read(0x3c00);
      expect(called).toBe(false);
    });
  });
});

describe('trs80CharToDisplay', () => {
  describe('ASCII text ranges', () => {
    it('passes through standard printable ASCII ($20-$5F)', () => {
      expect(trs80CharToDisplay(0x20)).toBe(' ');
      expect(trs80CharToDisplay(0x41)).toBe('A');
      expect(trs80CharToDisplay(0x30)).toBe('0');
      expect(trs80CharToDisplay(0x5f)).toBe('_');
    });

    it('maps $00-$1F to uppercase letters (@ A-Z symbols)', () => {
      expect(trs80CharToDisplay(0x00)).toBe('@');
      expect(trs80CharToDisplay(0x01)).toBe('A');
      expect(trs80CharToDisplay(0x1a)).toBe('Z');
    });

    it('maps $60-$7F to $20-$3F (no lowercase on stock Model I)', () => {
      expect(trs80CharToDisplay(0x60)).toBe(' ');
      expect(trs80CharToDisplay(0x61)).toBe('!');
      expect(trs80CharToDisplay(0x7a)).toBe(':');
    });
  });

  describe('inverse video ($C0-$FF)', () => {
    it('maps $C0-$DF to uppercase letters', () => {
      expect(trs80CharToDisplay(0xc0)).toBe('@');
      expect(trs80CharToDisplay(0xc1)).toBe('A');
      expect(trs80CharToDisplay(0xda)).toBe('Z');
    });

    it('maps $E0-$FF to space/digits/punctuation', () => {
      expect(trs80CharToDisplay(0xe0)).toBe(' ');
      expect(trs80CharToDisplay(0xf0)).toBe('0');
      expect(trs80CharToDisplay(0xf9)).toBe('9');
    });
  });

  describe('semigraphic block characters ($80-$BF)', () => {
    it('returns space for empty block ($80, all bits clear)', () => {
      expect(trs80CharToDisplay(0x80)).toBe(' ');
    });

    it('returns full block for all bits set ($BF)', () => {
      expect(trs80CharToDisplay(0xbf)).toBe('\u2588');
    });

    it('returns Unicode shade characters for partial blocks', () => {
      // Single bit set (1 of 6 lit)
      const oneBlock = trs80CharToDisplay(0x81); // bit 0 only
      expect(oneBlock).toMatch(/[\u2591\u2592\u2593]/);

      // Most bits set (5 of 6 lit)
      const fiveBlocks = trs80CharToDisplay(0xbe); // bits 0-4 set, bit 5 clear
      expect(fiveBlocks).toMatch(/[\u2591\u2592\u2593]/);
    });

    it('extracts only lower 6 bits for the pattern', () => {
      // $80 = 10_000000 → bits = 0x00 → space
      expect(trs80CharToDisplay(0x80)).toBe(' ');
      // $BF = 10_111111 → bits = 0x3F → full block
      expect(trs80CharToDisplay(0xbf)).toBe('\u2588');
      // $A5 = 10_100101 → bits = 0x25 → partial
      const partial = trs80CharToDisplay(0xa5);
      expect(partial).not.toBe(' ');
      expect(partial).not.toBe('\u2588');
    });
  });
});

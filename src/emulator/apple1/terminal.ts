/**
 * Apple I Terminal Display — 40x24 character output
 *
 * The Apple I display is a pure terminal: characters appear sequentially
 * at the cursor position, advancing left to right, wrapping and scrolling
 * like a teletype. There is no cursor addressing — only sequential output.
 *
 * Character set:
 *   - Printable range: ASCII $20-$5F (space through underscore)
 *   - Includes uppercase A-Z, digits 0-9, and symbols: !"#$%&'()*+,-./:;<=>?@[\]^_
 *   - No lowercase letters (Apple I hardware only generates/displays uppercase)
 *   - CR ($0D) moves cursor to beginning of next line
 *
 * This class maintains a 40x24 character buffer and provides the content
 * as a string suitable for rendering in a <pre> element.
 */

export const COLS = 40;
export const ROWS = 24;

export class Terminal {
  /** Screen buffer — each row is a string of up to COLS characters. */
  private lines: string[];

  /** Current cursor column (0-based). */
  private cursorCol: number;

  /** Current cursor row (0-based). */
  private cursorRow: number;

  /** Optional callback invoked whenever the screen content changes. */
  private onChange: (() => void) | null = null;

  constructor() {
    this.lines = [];
    this.cursorCol = 0;
    this.cursorRow = 0;
    this.clear();
  }

  /** Register a callback invoked on any screen content change. */
  setOnChange(cb: () => void): void {
    this.onChange = cb;
  }

  /**
   * Output a character to the terminal.
   * This is the callback to wire into PIA.setDisplayOutputCallback().
   *
   * The PIA strips bit 7 before calling, so `char` is 7-bit ASCII.
   */
  putChar(char: number): void {
    if (char === 0x0d) {
      // Carriage return — move to start of next line
      this.newline();
    } else if (char >= 0x20 && char <= 0x5f) {
      // Printable character — place at cursor and advance
      this.setCharAt(this.cursorRow, this.cursorCol, String.fromCharCode(char));
      this.cursorCol++;
      if (this.cursorCol >= COLS) {
        // Wrap to next line
        this.newline();
      }
    }
    // Characters outside printable range (except CR) are ignored,
    // matching Apple I hardware behavior.

    this.notifyChange();
  }

  /** Clear the screen and reset cursor to top-left. */
  clear(): void {
    this.lines = new Array(ROWS).fill('');
    this.cursorCol = 0;
    this.cursorRow = 0;
    this.notifyChange();
  }

  /** Reset terminal to initial state (same as clear). */
  reset(): void {
    this.clear();
  }

  /** Get current cursor column (0-based). */
  getCursorCol(): number {
    return this.cursorCol;
  }

  /** Get current cursor row (0-based). */
  getCursorRow(): number {
    return this.cursorRow;
  }

  /**
   * Get the screen content as a single string for <pre> rendering.
   * Each row is padded to COLS characters and joined with newlines.
   */
  getScreenContent(): string {
    return this.lines.map((line) => line.padEnd(COLS)).join('\n');
  }

  /**
   * Get the screen content as an array of row strings.
   * Each row is padded to COLS characters.
   */
  getLines(): string[] {
    return this.lines.map((line) => line.padEnd(COLS));
  }

  /** Get a single row's content (0-based index, padded to COLS). */
  getLine(row: number): string {
    if (row < 0 || row >= ROWS) return ''.padEnd(COLS);
    return this.lines[row].padEnd(COLS);
  }

  /** Place a character at a specific row/col, extending the line if needed. */
  private setCharAt(row: number, col: number, ch: string): void {
    const line = this.lines[row];
    if (col >= line.length) {
      // Extend with spaces up to the target column, then place the character
      this.lines[row] = line.padEnd(col) + ch;
    } else {
      // Replace character at column
      this.lines[row] = line.substring(0, col) + ch + line.substring(col + 1);
    }
  }

  /** Advance to the beginning of the next line, scrolling if needed. */
  private newline(): void {
    this.cursorCol = 0;
    this.cursorRow++;
    if (this.cursorRow >= ROWS) {
      this.scroll();
      this.cursorRow = ROWS - 1;
    }
  }

  /** Scroll all lines up by one, discarding the top line. */
  private scroll(): void {
    this.lines.shift();
    this.lines.push('');
  }

  private notifyChange(): void {
    if (this.onChange) {
      this.onChange();
    }
  }
}

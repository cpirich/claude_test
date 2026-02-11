/**
 * TRS-80 Model I Video RAM — Memory-mapped display at $3C00-$3FFF
 *
 * The TRS-80 uses a simple memory-mapped video display:
 *   - 64 columns × 16 rows = 1,024 character positions
 *   - Each byte in video RAM maps directly to one screen character
 *   - Linear layout: Row 0 at $3C00-$3C3F, Row 1 at $3C40-$3C7F, etc.
 *   - Address = $3C00 + (row × 64) + column
 *
 * Character set (original Model I without lowercase mod):
 *   The MCM6670P character generator uses only the lower 6 bits of the
 *   character code (ignoring bit 6), giving 64 unique glyphs:
 *     Positions $00-$1F: @ A B C D E F G H I J K L M N O P Q R S T U V W X Y Z [ \ ] ↑ ←
 *     Positions $20-$3F: (space) ! " # $ % & ' ( ) * + , - . / 0 1 2 3 4 5 6 7 8 9 : ; < = > ?
 *   Since bit 6 is ignored:
 *     $00-$1F and $40-$5F show the same glyphs (@ A-Z symbols)
 *     $20-$3F and $60-$7F show the same glyphs (space digits punctuation)
 *   - Codes $80-$BF: 2×3 block graphics (6 pixels per cell)
 *   - Codes $C0-$FF: Inverse-video of $00-$3F
 *
 * For text display, we map the full 0-255 range:
 *   - $00-$1F: map to ASCII $40-$5F (@ A B ... Z [ \ ] ^ _)
 *   - $20-$5F: standard ASCII passthrough
 *   - $60-$7F: map to ASCII $20-$3F (stock Model I has no lowercase)
 *   - $80-$BF: block graphics → Unicode block elements
 *   - $C0-$FF: inverse-video → strip high bits, display as ASCII
 *
 * The video controller reads from this RAM continuously to generate
 * the display signal. Writing to video RAM immediately changes the screen.
 */

export const VIDEO_BASE = 0x3c00;
export const VIDEO_END = 0x3fff;
export const VIDEO_SIZE = 1024;
export const VIDEO_COLS = 64;
export const VIDEO_ROWS = 16;

/**
 * Map a TRS-80 character code (0x00-0xFF) to a displayable character.
 *
 * TRS-80 Model I character mapping:
 *   $00-$1F → @ A B C D E F G H I J K L M N O P Q R S T U V W X Y Z [ \ ] ^ _
 *   $20-$5F → standard ASCII printable characters (passthrough)
 *   $60-$7F → same as $20-$3F (stock Model I; no lowercase without hardware mod)
 *   $80-$BF → 2×3 block graphics → Unicode block elements
 *   $C0-$FF → inverse of $00-$3F → strip high bits, show as ASCII
 */
export function trs80CharToDisplay(code: number): string {
  code &= 0xff;

  // $20-$5F: Standard ASCII printable range — pass through directly
  if (code >= 0x20 && code <= 0x5f) {
    return String.fromCharCode(code);
  }

  // $00-$1F: TRS-80 character ROM maps to @ A B C D ... Z [ \ ] ^ _
  // (same glyphs as ASCII $40-$5F)
  if (code <= 0x1f) {
    return String.fromCharCode(code + 0x40);
  }

  // $60-$7F: Stock Model I duplicates $20-$3F glyphs (no lowercase mod)
  if (code <= 0x7f) {
    return String.fromCharCode(code - 0x40);
  }

  // $C0-$FF: inverse-video characters — strip bits 6+7 to get $00-$3F,
  // then display as the corresponding character
  if (code >= 0xc0) {
    const base = code & 0x3f;
    if (base >= 0x20) {
      // $E0-$FF: inverse of $20-$3F (space, digits, punctuation)
      return String.fromCharCode(base);
    }
    // $C0-$DF: inverse of $00-$1F (@ A-Z symbols)
    return String.fromCharCode(base + 0x40);
  }

  // $80-$BF: 2×3 block graphics
  // Map to Unicode block elements for approximate visual representation.
  // Each character has 6 pixels in a 2×3 grid. Bits 0-5 control which
  // blocks are lit: bit0=TL, bit1=TR, bit2=ML, bit3=MR, bit4=BL, bit5=BR
  // For simplicity, map based on how many blocks are lit:
  const gfxBits = code & 0x3f;
  if (gfxBits === 0) return ' ';
  if (gfxBits === 0x3f) return '\u2588'; // Full block
  // Use quarter/half blocks for common patterns
  const popcount = ((gfxBits & 0x55) + ((gfxBits >> 1) & 0x55));
  const lit = (popcount & 0x03) + ((popcount >> 2) & 0x03) + ((popcount >> 4) & 0x03);
  if (lit <= 2) return '\u2591'; // Light shade
  if (lit <= 4) return '\u2592'; // Medium shade
  return '\u2593'; // Dark shade
}

/** Callback invoked when video RAM is modified. */
export type VideoChangeCallback = (address: number, value: number) => void;

export class TRS80Video {
  /** 1K video RAM. */
  private vram: Uint8Array = new Uint8Array(VIDEO_SIZE);

  /** Optional callback for display updates. */
  private onChange: VideoChangeCallback | null = null;

  /** Last video RAM offset written to (for cursor position tracking). */
  private lastWriteOffset = 0;

  /** Returns true if the address falls within video RAM range. */
  static inRange(address: number): boolean {
    return address >= VIDEO_BASE && address <= VIDEO_END;
  }

  /** Register a callback invoked on any video RAM write. */
  setOnChange(cb: VideoChangeCallback): void {
    this.onChange = cb;
  }

  /** Read a byte from video RAM. */
  read(address: number): number {
    return this.vram[(address - VIDEO_BASE) & (VIDEO_SIZE - 1)];
  }

  /** Write a byte to video RAM. */
  write(address: number, value: number): void {
    const offset = (address - VIDEO_BASE) & (VIDEO_SIZE - 1);
    this.vram[offset] = value & 0xff;
    this.lastWriteOffset = offset;
    if (this.onChange) {
      this.onChange(address, value);
    }
  }

  /**
   * Get the screen content as a 2D array of character codes.
   * Returns VIDEO_ROWS arrays of VIDEO_COLS bytes each.
   */
  getScreen(): number[][] {
    const screen: number[][] = [];
    for (let row = 0; row < VIDEO_ROWS; row++) {
      const offset = row * VIDEO_COLS;
      screen.push(Array.from(this.vram.slice(offset, offset + VIDEO_COLS)));
    }
    return screen;
  }

  /**
   * Get the screen content as a string for display.
   * Maps all TRS-80 character codes to displayable characters.
   * Rows are joined with newlines.
   */
  getScreenText(): string {
    const lines: string[] = [];
    for (let row = 0; row < VIDEO_ROWS; row++) {
      let line = '';
      for (let col = 0; col < VIDEO_COLS; col++) {
        line += trs80CharToDisplay(this.vram[row * VIDEO_COLS + col]);
      }
      lines.push(line);
    }
    return lines.join('\n');
  }

  /** Get a single row as a string. */
  getRow(row: number): string {
    if (row < 0 || row >= VIDEO_ROWS) return ' '.repeat(VIDEO_COLS);
    let line = '';
    for (let col = 0; col < VIDEO_COLS; col++) {
      line += trs80CharToDisplay(this.vram[row * VIDEO_COLS + col]);
    }
    return line;
  }

  /** Get the character code at a specific row/column. */
  getCharAt(row: number, col: number): number {
    if (row < 0 || row >= VIDEO_ROWS || col < 0 || col >= VIDEO_COLS) return 0;
    return this.vram[row * VIDEO_COLS + col];
  }

  /**
   * Get the cursor position derived from the last video RAM write.
   * Returns { row, col } of the position AFTER the last write
   * (i.e., where the next character would go).
   * This provides ROM-independent cursor tracking.
   */
  getLastWritePosition(): { row: number; col: number } {
    // Position after the last write
    const nextOffset = this.lastWriteOffset + 1;
    const row = Math.floor(nextOffset / VIDEO_COLS);
    const col = nextOffset % VIDEO_COLS;
    return {
      row: Math.min(row, VIDEO_ROWS - 1),
      col: col < VIDEO_COLS ? col : 0,
    };
  }

  /** Clear video RAM (fill with spaces). */
  clear(): void {
    this.vram.fill(0x20); // ASCII space
  }

  /** Reset video RAM to zeros. */
  reset(): void {
    this.vram.fill(0);
    this.lastWriteOffset = 0;
  }

  /** Direct access to underlying VRAM (for test inspection). */
  peek(offset: number): number {
    return this.vram[offset & (VIDEO_SIZE - 1)];
  }
}

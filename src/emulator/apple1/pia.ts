/**
 * Apple I PIA (6821) — Peripheral Interface Adapter
 *
 * Memory-mapped I/O registers at $D010-$D013:
 *
 *   $D010  KBD    — Keyboard data (read). Bit 7 set by hardware when key pressed.
 *                    Reading KBD clears bit 7 of KBDCR.
 *   $D011  KBDCR  — Keyboard control register (read). Bit 7 = key available.
 *   $D012  DSP    — Display data (write). Writing a character with bit 7 set
 *                    outputs it. Only low 7 bits are the character.
 *   $D013  DSPCR  — Display control register (read). Bit 7 = display ready.
 *
 * The real 6821 is more complex, but the Apple I only uses a small subset
 * of its capabilities. This implementation models exactly that subset.
 */

/** Callback invoked when a character is written to the display. */
export type DisplayOutputCallback = (char: number) => void;

// PIA register addresses (offsets from base $D010)
const PIA_BASE = 0xd010;
const PIA_END = 0xd013;

const REG_KBD = 0xd010;
const REG_KBDCR = 0xd011;
const REG_DSP = 0xd012;
const REG_DSPCR = 0xd013;

export class PIA {
  /** Keyboard data register — holds the last key pressed with bit 7 set. */
  private kbd: number = 0x00;

  /** Keyboard control register — bit 7 indicates a key is available. */
  private kbdcr: number = 0x00;

  /** Display data register. */
  private dsp: number = 0x00;

  /** Display control register — bit 7 indicates display is ready. */
  private dspcr: number = 0x00;

  /** Callback for display output. */
  private onDisplayOutput: DisplayOutputCallback | null = null;

  /** Returns true if the given address falls within the PIA register range. */
  static inRange(address: number): boolean {
    return address >= PIA_BASE && address <= PIA_END;
  }

  /** Register a callback for display output. */
  setDisplayOutputCallback(cb: DisplayOutputCallback): void {
    this.onDisplayOutput = cb;
  }

  /**
   * Read a PIA register.
   *
   * - KBD ($D010): Returns keyboard data. Clears KBDCR bit 7 (key consumed).
   * - KBDCR ($D011): Returns keyboard control register (bit 7 = key available).
   * - DSP ($D012): Returns display data register (not typically read by software).
   * - DSPCR ($D013): Returns display control register. Bit 7 is always set
   *   because the display is always ready (we're infinitely fast).
   */
  read(address: number): number {
    switch (address) {
      case REG_KBD:
        // Reading KBD clears the "key available" flag in KBDCR
        this.kbdcr &= 0x7f;
        return this.kbd;

      case REG_KBDCR:
        return this.kbdcr;

      case REG_DSP:
        return this.dsp;

      case REG_DSPCR:
        // Display is always ready in emulation — bit 7 set
        return this.dspcr | 0x80;

      default:
        return 0x00;
    }
  }

  /**
   * Write to a PIA register.
   *
   * - DSP ($D012): If bit 7 is set, the low 7 bits are sent to the display.
   *   Writing also clears bit 7 of DSP (character accepted).
   * - DSPCR ($D013): Written by the Woz Monitor during init; we store it but
   *   the display-ready bit (7) is always returned as set on read.
   * - KBD/KBDCR: Writes to keyboard registers are ignored (read-only on Apple I).
   */
  write(address: number, value: number): void {
    switch (address) {
      case REG_DSP: {
        this.dsp = value;
        // The Woz Monitor sets bit 7 before writing to DSP.
        // Output the low 7 bits as the character.
        const char = value & 0x7f;
        if (this.onDisplayOutput) {
          this.onDisplayOutput(char);
        }
        // Clear bit 7 to signal the character was accepted
        this.dsp &= 0x7f;
        break;
      }

      case REG_DSPCR:
        this.dspcr = value;
        break;

      // KBD and KBDCR are read-only from the CPU side
      case REG_KBD:
      case REG_KBDCR:
        break;
    }
  }

  /**
   * Called by the terminal/keyboard handler when a key is pressed.
   * Sets KBD to the ASCII value with bit 7 set (as the Apple I hardware does),
   * and sets KBDCR bit 7 to signal a key is available.
   */
  keyPress(asciiValue: number): void {
    // Apple I keyboard sets bit 7 high on all key data
    this.kbd = (asciiValue & 0x7f) | 0x80;
    // Signal that a key is available
    this.kbdcr |= 0x80;
  }

  /** Returns true if a key is pending (KBDCR bit 7 set). */
  hasKey(): boolean {
    return (this.kbdcr & 0x80) !== 0;
  }

  /** Reset the PIA to initial state. */
  reset(): void {
    this.kbd = 0x00;
    this.kbdcr = 0x00;
    this.dsp = 0x00;
    this.dspcr = 0x00;
  }
}

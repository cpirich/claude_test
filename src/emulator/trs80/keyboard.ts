/**
 * TRS-80 Model I Keyboard — Memory-mapped matrix at $3800-$3BFF
 *
 * The keyboard uses an 8-row × 8-column matrix scanned via memory-mapped I/O.
 * Address bits A0-A7 select which row(s) to read. Data bits D0-D7 indicate
 * which keys in the selected row(s) are currently pressed.
 *
 * Row addresses (active when the corresponding address bit is set):
 *   Bit 0 ($3801): @  A  B  C  D  E  F  G
 *   Bit 1 ($3802): H  I  J  K  L  M  N  O
 *   Bit 2 ($3804): P  Q  R  S  T  U  V  W
 *   Bit 3 ($3808): X  Y  Z  -  -  -  -  -
 *   Bit 4 ($3810): 0  1  2  3  4  5  6  7
 *   Bit 5 ($3820): 8  9  :  ;  ,  -  .  /
 *   Bit 6 ($3840): ENTER CLEAR BREAK UP DOWN LEFT RIGHT SPACE
 *   Bit 7 ($3880): SHIFT -  -  -  -  -  -  -
 *
 * Reading an address with multiple bits set ORs the rows together,
 * allowing detection of any key press across multiple rows simultaneously.
 *
 * Address range $3900-$3BFF mirrors $3800-$38FF.
 *
 * Minimum hold time:
 *   Browser keyboard events arrive asynchronously between emulation frames.
 *   Each key press is held in the matrix for at least MIN_HOLD_CYCLES
 *   regardless of when keyUp is called. This ensures the ROM always detects
 *   every keystroke, even if keyDown and keyUp both fire between frames
 *   (before the CPU has scanned the matrix). The hold timer is advanced by
 *   calling tick() from the system's run loop after each CPU step.
 */

const KEYBOARD_BASE = 0x3800;
const KEYBOARD_END = 0x3bff;

/** Key identifiers for the TRS-80 keyboard. */
export type TRS80Key =
  // Row 0 ($3801)
  | '@' | 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G'
  // Row 1 ($3802)
  | 'H' | 'I' | 'J' | 'K' | 'L' | 'M' | 'N' | 'O'
  // Row 2 ($3804)
  | 'P' | 'Q' | 'R' | 'S' | 'T' | 'U' | 'V' | 'W'
  // Row 3 ($3808)
  | 'X' | 'Y' | 'Z'
  // Row 4 ($3810)
  | '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7'
  // Row 5 ($3820)
  | '8' | '9' | ':' | ';' | ',' | '-' | '.' | '/'
  // Row 6 ($3840)
  | 'ENTER' | 'CLEAR' | 'BREAK' | 'UP' | 'DOWN' | 'LEFT' | 'RIGHT' | 'SPACE'
  // Row 7 ($3880)
  | 'SHIFT';

/** Keyboard matrix entry: row index (0-7) and bit position (0-7). */
interface MatrixPosition {
  row: number;
  bit: number;
}

/** Complete key-to-matrix mapping. */
const KEY_MAP: Record<TRS80Key, MatrixPosition> = {
  // Row 0 (address bit 0)
  '@': { row: 0, bit: 0 },
  'A': { row: 0, bit: 1 },
  'B': { row: 0, bit: 2 },
  'C': { row: 0, bit: 3 },
  'D': { row: 0, bit: 4 },
  'E': { row: 0, bit: 5 },
  'F': { row: 0, bit: 6 },
  'G': { row: 0, bit: 7 },

  // Row 1 (address bit 1)
  'H': { row: 1, bit: 0 },
  'I': { row: 1, bit: 1 },
  'J': { row: 1, bit: 2 },
  'K': { row: 1, bit: 3 },
  'L': { row: 1, bit: 4 },
  'M': { row: 1, bit: 5 },
  'N': { row: 1, bit: 6 },
  'O': { row: 1, bit: 7 },

  // Row 2 (address bit 2)
  'P': { row: 2, bit: 0 },
  'Q': { row: 2, bit: 1 },
  'R': { row: 2, bit: 2 },
  'S': { row: 2, bit: 3 },
  'T': { row: 2, bit: 4 },
  'U': { row: 2, bit: 5 },
  'V': { row: 2, bit: 6 },
  'W': { row: 2, bit: 7 },

  // Row 3 (address bit 3)
  'X': { row: 3, bit: 0 },
  'Y': { row: 3, bit: 1 },
  'Z': { row: 3, bit: 2 },

  // Row 4 (address bit 4)
  '0': { row: 4, bit: 0 },
  '1': { row: 4, bit: 1 },
  '2': { row: 4, bit: 2 },
  '3': { row: 4, bit: 3 },
  '4': { row: 4, bit: 4 },
  '5': { row: 4, bit: 5 },
  '6': { row: 4, bit: 6 },
  '7': { row: 4, bit: 7 },

  // Row 5 (address bit 5)
  '8': { row: 5, bit: 0 },
  '9': { row: 5, bit: 1 },
  ':': { row: 5, bit: 2 },
  ';': { row: 5, bit: 3 },
  ',': { row: 5, bit: 4 },
  '-': { row: 5, bit: 5 },
  '.': { row: 5, bit: 6 },
  '/': { row: 5, bit: 7 },

  // Row 6 (address bit 6)
  'ENTER': { row: 6, bit: 0 },
  'CLEAR': { row: 6, bit: 1 },
  'BREAK': { row: 6, bit: 2 },
  'UP':    { row: 6, bit: 3 },
  'DOWN':  { row: 6, bit: 4 },
  'LEFT':  { row: 6, bit: 5 },
  'RIGHT': { row: 6, bit: 6 },
  'SPACE': { row: 6, bit: 7 },

  // Row 7 (address bit 7)
  'SHIFT': { row: 7, bit: 0 },
};

/**
 * Minimum cycles a key stays in the matrix after keyDown, regardless of keyUp.
 *
 * This value must exceed the longest keyboard scan interval of any supported ROM:
 *   - Stub ROM: polls every ~10 cycles (any hold time works)
 *   - Level I/II BASIC: scan via timer interrupt every ~44,350 cycles (~40 Hz)
 *
 * In the browser, typeCommand calls keyDown/keyUp via setTimeout, and both
 * often fire between animation frames when no CPU cycles execute.  The hold
 * timer is the ONLY thing keeping the key visible to the CPU.  With the old
 * value of 5600 the key vanished after ~3.2ms — well before the next
 * interrupt-driven scan at ~25ms, causing most keystrokes to be missed.
 *
 * 50,000 cycles ≈ 28ms at 1.774 MHz — guarantees at least one full interrupt
 * period (44,350 cycles) elapses while the key is in the matrix.
 */
const MIN_HOLD_CYCLES = 50_000;

export class TRS80Keyboard {
  /** 8 rows, each an 8-bit value of currently pressed keys. */
  private rows: Uint8Array = new Uint8Array(8);

  /**
   * Hold timers for each key position (8 rows × 8 bits).
   * When > 0, the key stays in the matrix even after keyUp.
   * Decremented by tick() each CPU step.
   */
  private holdTimers: Int32Array = new Int32Array(64);

  /**
   * Physical state: tracks which keys the user is currently holding.
   * When keyUp is called, the bit is cleared here immediately, but
   * the matrix bit persists until the hold timer expires.
   */
  private physical: Uint8Array = new Uint8Array(8);

  /** Returns true if the given address falls within the keyboard range. */
  static inRange(address: number): boolean {
    return address >= KEYBOARD_BASE && address <= KEYBOARD_END;
  }

  /**
   * Read the keyboard matrix at the given address.
   *
   * The low byte of the address selects which rows to scan. Each bit
   * corresponds to a row. If multiple bits are set, the rows are ORed
   * together, allowing multi-row scanning in a single read.
   *
   * Address $3800 (no bits set) returns 0.
   */
  read(address: number): number {
    const rowSelect = address & 0xff;
    let result = 0;

    for (let i = 0; i < 8; i++) {
      if (rowSelect & (1 << i)) {
        result |= this.rows[i];
      }
    }

    return result;
  }

  /**
   * Press a key — set its bit in the matrix and start the hold timer.
   * The key stays in the matrix for at least MIN_HOLD_CYCLES even if
   * keyUp is called immediately.
   */
  keyDown(key: TRS80Key): void {
    const pos = KEY_MAP[key];
    if (pos) {
      this.rows[pos.row] |= (1 << pos.bit);
      this.physical[pos.row] |= (1 << pos.bit);
      this.holdTimers[pos.row * 8 + pos.bit] = MIN_HOLD_CYCLES;
    }
  }

  /**
   * Release a key — mark as physically released.
   * The matrix bit is NOT cleared immediately. Instead, it persists until
   * the hold timer expires (via tick()). This prevents lost keystrokes
   * when keyDown/keyUp both fire between animation frames.
   */
  keyUp(key: TRS80Key): void {
    const pos = KEY_MAP[key];
    if (pos) {
      this.physical[pos.row] &= ~(1 << pos.bit);
      // If hold timer already expired, clear the matrix bit now
      if (this.holdTimers[pos.row * 8 + pos.bit] <= 0) {
        this.rows[pos.row] &= ~(1 << pos.bit);
      }
    }
  }

  /**
   * Advance hold timers by the given number of cycles.
   * Call this from the system's run loop after each CPU step.
   * When a timer expires and the key is no longer physically pressed,
   * the matrix bit is cleared so the ROM's release-wait loop exits.
   */
  tick(cycles: number): void {
    for (let r = 0; r < 8; r++) {
      for (let b = 0; b < 8; b++) {
        const idx = r * 8 + b;
        if (this.holdTimers[idx] > 0) {
          this.holdTimers[idx] -= cycles;
          if (this.holdTimers[idx] <= 0) {
            this.holdTimers[idx] = 0;
            // Timer expired — if key is no longer physically held, release it
            const mask = 1 << b;
            if (!(this.physical[r] & mask)) {
              this.rows[r] &= ~mask;
            }
          }
        }
      }
    }
  }

  /** Check if a specific key is currently pressed (in the matrix). */
  isKeyDown(key: TRS80Key): boolean {
    const pos = KEY_MAP[key];
    if (!pos) return false;
    return (this.rows[pos.row] & (1 << pos.bit)) !== 0;
  }

  /** Release all keys and clear timers. */
  reset(): void {
    this.rows.fill(0);
    this.physical.fill(0);
    this.holdTimers.fill(0);
  }

  /** Get the raw row data (for debugging/testing). */
  getRow(row: number): number {
    return this.rows[row & 7];
  }
}

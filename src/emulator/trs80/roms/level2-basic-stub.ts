/**
 * TRS-80 Level II BASIC Stub ROM
 *
 * A minimal Z80 ROM that simulates the TRS-80 boot sequence for testing
 * without requiring the copyrighted Level II BASIC ROM.
 *
 * Behavior:
 * 1. Clears video RAM ($3C00-$3FFF) with spaces ($20)
 * 2. Writes "READY" at the top-left of the screen
 * 3. Positions cursor at row 1, col 0
 * 4. Keyboard loop: scan rows, map key to ASCII, write to video RAM
 * 5. ENTER moves cursor to next line
 *
 * Keyboard rows handled:
 *   Row 0 ($3801): @ABCDEFG  → ASCII $40-$47
 *   Row 1 ($3802): HIJKLMNO  → ASCII $48-$4F
 *   Row 2 ($3804): PQRSTUVW  → ASCII $50-$57
 *   Row 3 ($3808): XYZ       → ASCII $58-$5A
 *   Row 4 ($3810): 01234567  → ASCII $30-$37
 *   Row 5 ($3820): 89:;,-./  → ASCII $38-$3F
 *   Row 6 ($3840): ENTER, SPACE (other keys ignored)
 *
 * Cursor position stored at $4000-$4001 (user RAM).
 * Saved keyboard row data at $4002-$4004 (rows 3, 4, 5).
 */

export const TRS80_STUB_ROM: Uint8Array = (() => {
  const rom = new Uint8Array(0x3000);
  const code: number[] = [];

  const push = (...bytes: number[]) => {
    for (const b of bytes) code.push(b);
  };
  const pos = () => code.length;

  // Helper: emit JP nn (absolute jump, 3 bytes, no range limit)
  const emitJP = (target: number) => {
    push(0xc3, target & 0xff, (target >> 8) & 0xff);
  };

  // --- Initialization ---
  push(0x31, 0xff, 0xff); // LD SP,$FFFF
  push(0xf3);              // DI

  // --- Clear video RAM ($3C00-$3FFF) with spaces ---
  push(0x21, 0x00, 0x3c); // LD HL,$3C00
  push(0x01, 0x00, 0x04); // LD BC,$0400
  const clearLoop = pos();
  push(0x3e, 0x20);       // LD A,$20
  push(0x77);              // LD (HL),A
  push(0x23);              // INC HL
  push(0x0b);              // DEC BC
  push(0x78);              // LD A,B
  push(0xb1);              // OR C
  push(0x20, (clearLoop - (pos() + 2)) & 0xff); // JR NZ,clear_loop

  // --- Write "READY" at $3C00 ---
  push(0x21, 0x00, 0x3c); // LD HL,$3C00
  for (const ch of [0x52, 0x45, 0x41, 0x44, 0x59]) { // R E A D Y
    push(0x3e, ch);        // LD A,char
    push(0x77);            // LD (HL),A
    push(0x23);            // INC HL
  }

  // --- Initialize cursor at row 1, col 0 ($3C40) ---
  push(0x21, 0x40, 0x3c); // LD HL,$3C40
  push(0x22, 0x00, 0x40); // LD ($4000),HL

  // ============================================================
  // Keyboard polling loop
  // Strategy: poll $38FF until key detected, capture ALL row state
  // into registers + RAM while key is still pressed, wait for
  // release, then process from saved state.
  // ============================================================

  const pollKeyboard = pos();
  push(0x3a, 0xff, 0x38); // LD A,($38FF) — scan all rows at once
  push(0xb7);              // OR A
  push(0x28, (pollKeyboard - (pos() + 2)) & 0xff); // JR Z,poll — no key

  // --- Key detected: capture ALL row state immediately ---
  // Registers: D=row6, C=row0, E=row1, B=row2
  push(0x3a, 0x40, 0x38); // LD A,($3840) — row 6 (ENTER/SPACE)
  push(0x57);              // LD D,A
  push(0x3a, 0x01, 0x38); // LD A,($3801) — row 0 (@ABCDEFG)
  push(0x4f);              // LD C,A
  push(0x3a, 0x02, 0x38); // LD A,($3802) — row 1 (HIJKLMNO)
  push(0x5f);              // LD E,A
  push(0x3a, 0x04, 0x38); // LD A,($3804) — row 2 (PQRSTUVW)
  push(0x47);              // LD B,A

  // Save rows 3, 4, 5 to user RAM (no registers left)
  push(0x3a, 0x08, 0x38); // LD A,($3808) — row 3 (XYZ)
  push(0x32, 0x02, 0x40); // LD ($4002),A
  push(0x3a, 0x10, 0x38); // LD A,($3810) — row 4 (0-7)
  push(0x32, 0x03, 0x40); // LD ($4003),A
  push(0x3a, 0x20, 0x38); // LD A,($3820) — row 5 (8-9/:;,-./)
  push(0x32, 0x04, 0x40); // LD ($4004),A

  // --- Wait for key release ---
  const waitRelease = pos();
  push(0x3a, 0xff, 0x38); // LD A,($38FF)
  push(0xb7);              // OR A
  push(0x20, (waitRelease - (pos() + 2)) & 0xff); // JR NZ,wait_release

  // --- Process saved key state ---

  // Check ENTER (D register = row 6, bit 0)
  push(0x7a);              // LD A,D
  push(0xcb, 0x47);        // BIT 0,A
  const enterJr = pos();
  push(0x20, 0x00);        // JR NZ,handle_enter (patch later)

  // Check SPACE (D register = row 6, bit 7)
  push(0x7a);              // LD A,D
  push(0xcb, 0x7f);        // BIT 7,A
  const spaceJr = pos();
  push(0x20, 0x00);        // JR NZ,handle_space (patch later)

  // --- Check letter rows ---

  // Row 0 (C register): @=bit0, A=bit1, ... G=bit7
  push(0x79);              // LD A,C
  push(0xb7);              // OR A
  const row0Jr = pos();
  push(0x28, 0x00);        // JR Z,check_row1 (patch)
  push(0x26, 0x40);        // LD H,'@' ($40)
  const findBitJr1 = pos();
  push(0x18, 0x00);        // JR find_bit (patch)

  // check_row1: Row 1 (E register): H=bit0, ... O=bit7
  const checkRow1 = pos();
  push(0x7b);              // LD A,E
  push(0xb7);              // OR A
  const row1Jr = pos();
  push(0x28, 0x00);        // JR Z,check_row2 (patch)
  push(0x26, 0x48);        // LD H,'H' ($48)
  const findBitJr2 = pos();
  push(0x18, 0x00);        // JR find_bit (patch)

  // check_row2: Row 2 (B register): P=bit0, ... W=bit7
  const checkRow2 = pos();
  push(0x78);              // LD A,B
  push(0xb7);              // OR A
  const row2Jr = pos();
  push(0x28, 0x00);        // JR Z,check_row3 (patch)
  push(0x26, 0x50);        // LD H,'P' ($50)
  const findBitJr3 = pos();
  push(0x18, 0x00);        // JR find_bit (patch)

  // check_row3: Row 3 (saved at $4002): X=bit0, Y=bit1, Z=bit2
  const checkRow3 = pos();
  push(0x3a, 0x02, 0x40); // LD A,($4002)
  push(0xb7);              // OR A
  const row3Jr = pos();
  push(0x28, 0x00);        // JR Z,check_row4 (patch)
  push(0x26, 0x58);        // LD H,'X' ($58)
  const findBitJr4 = pos();
  push(0x18, 0x00);        // JR find_bit (patch)

  // check_row4: Row 4 (saved at $4003): 0=bit0, ... 7=bit7
  const checkRow4 = pos();
  push(0x3a, 0x03, 0x40); // LD A,($4003)
  push(0xb7);              // OR A
  const row4Jr = pos();
  push(0x28, 0x00);        // JR Z,check_row5 (patch)
  push(0x26, 0x30);        // LD H,'0' ($30)
  const findBitJr5 = pos();
  push(0x18, 0x00);        // JR find_bit (patch)

  // check_row5: Row 5 (saved at $4004): 8=bit0, 9=bit1, :=bit2, etc.
  const checkRow5 = pos();
  push(0x3a, 0x04, 0x40); // LD A,($4004)
  push(0xb7);              // OR A
  const row5Jr = pos();
  push(0x28, 0x00);        // JR Z,no_key (patch)
  push(0x26, 0x38);        // LD H,'8' ($38)
  // Fall through to find_bit

  // find_bit: A has row data, H has base ASCII char
  // Find lowest set bit, add to H for final ASCII code
  const findBit = pos();
  push(0x0e, 0xff);        // LD C,$FF (counter, becomes 0 on first INC)
  const bitLoop = pos();
  push(0x0c);              // INC C
  push(0xcb, 0x3f);        // SRL A — shift right, bit 0 → carry
  push(0x30, (bitLoop - (pos() + 2)) & 0xff); // JR NC,bit_loop
  // C = bit position. Final char = H + C
  push(0x7c);              // LD A,H (base char)
  push(0x81);              // ADD A,C (add bit position)
  // Fall through to write_char

  // write_char: A = character to write at cursor
  const writeChar = pos();
  push(0x2a, 0x00, 0x40); // LD HL,($4000) — cursor address
  push(0x77);              // LD (HL),A — write char to video RAM
  push(0x23);              // INC HL — advance cursor
  // Bounds check: if HL >= $4000, wrap to $3C00
  push(0x7c);              // LD A,H
  push(0xfe, 0x40);        // CP $40
  push(0x38, 0x03);        // JR C,save_cursor (within bounds)
  push(0x21, 0x00, 0x3c);  // LD HL,$3C00 (wrap to top)
  // save_cursor:
  push(0x22, 0x00, 0x40); // LD ($4000),HL
  emitJP(pollKeyboard);   // JP poll_keyboard

  // handle_enter: move cursor to start of next row
  const handleEnter = pos();
  push(0x2a, 0x00, 0x40); // LD HL,($4000)
  push(0x7d);              // LD A,L
  push(0xe6, 0xc0);        // AND $C0 — mask to row start
  push(0xc6, 0x40);        // ADD A,$40 — next row
  push(0x6f);              // LD L,A
  push(0x30, 0x01);        // JR NC,skip_inc_h
  push(0x24);              // INC H
  // Bounds check
  push(0x7c);              // LD A,H
  push(0xfe, 0x40);        // CP $40
  push(0x38, 0x03);        // JR C,save_enter
  push(0x21, 0x00, 0x3c);  // LD HL,$3C00 (wrap)
  // save_enter:
  push(0x22, 0x00, 0x40); // LD ($4000),HL
  emitJP(pollKeyboard);   // JP poll_keyboard

  // handle_space: write space character
  const handleSpace = pos();
  push(0x3e, 0x20);        // LD A,$20
  push(0x18, (writeChar - (pos() + 2)) & 0xff); // JR write_char

  // no_key: unrecognized key (SHIFT alone, arrows, etc.) — back to polling
  const noKey = pos();
  emitJP(pollKeyboard);   // JP poll_keyboard

  // --- Patch forward references ---
  code[enterJr + 1] = (handleEnter - (enterJr + 2)) & 0xff;
  code[spaceJr + 1] = (handleSpace - (spaceJr + 2)) & 0xff;
  code[row0Jr + 1] = (checkRow1 - (row0Jr + 2)) & 0xff;
  code[findBitJr1 + 1] = (findBit - (findBitJr1 + 2)) & 0xff;
  code[row1Jr + 1] = (checkRow2 - (row1Jr + 2)) & 0xff;
  code[findBitJr2 + 1] = (findBit - (findBitJr2 + 2)) & 0xff;
  code[row2Jr + 1] = (checkRow3 - (row2Jr + 2)) & 0xff;
  code[findBitJr3 + 1] = (findBit - (findBitJr3 + 2)) & 0xff;
  code[row3Jr + 1] = (checkRow4 - (row3Jr + 2)) & 0xff;
  code[findBitJr4 + 1] = (findBit - (findBitJr4 + 2)) & 0xff;
  code[row4Jr + 1] = (checkRow5 - (row4Jr + 2)) & 0xff;
  code[findBitJr5 + 1] = (findBit - (findBitJr5 + 2)) & 0xff;
  code[row5Jr + 1] = (noKey - (row5Jr + 2)) & 0xff;

  rom.set(code);
  return rom;
})();

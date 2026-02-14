/**
 * TRS-80 Level II BASIC Stub ROM
 *
 * A minimal Z80 ROM that simulates the TRS-80 boot sequence for testing
 * without requiring the copyrighted Level II BASIC ROM.
 *
 * Memory layout:
 *   $0000:  JP init         — jump past ISR to initialization
 *   $0038:  ISR             — timer interrupt handler (read port $FF, return)
 *   $0049:  JP keyin_impl   — KEYIN entry point (many ML programs CALL $0049)
 *   $004C+: initialization and keyboard loop code
 *
 * Behavior:
 * 1. Clears video RAM ($3C00-$3FFF) with spaces ($20)
 * 2. Writes "READY" at the top-left of the screen
 * 3. Positions cursor at row 1, col 0
 * 4. Keyboard loop: calls KEYIN to get a key, writes to video RAM
 * 5. ENTER moves cursor to next line
 *
 * The ISR at $0038 handles the ~40 Hz timer interrupt that the TRS-80
 * generates on vertical retrace. ML programs that enable interrupts (EI)
 * will crash without a valid ISR at this address. The handler acknowledges
 * the interrupt by reading port $FF and returns.
 *
 * The KEYIN routine at $0049 provides a standard ROM entry point for ML
 * programs to read the keyboard. It polls the matrix, decodes the key,
 * waits for release, and returns the ASCII code in A.
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
 * Keyboard scratch space at $4002-$4004 (rows 3, 4, 5).
 */

export const TRS80_STUB_ROM: Uint8Array = (() => {
  const rom = new Uint8Array(0x3000);
  const code: number[] = [];

  const push = (...bytes: number[]) => {
    for (const b of bytes) code.push(b);
  };
  const pos = () => code.length;

  // Helper: emit JP nn (absolute jump, 3 bytes)
  const emitJP = (target: number) => {
    push(0xc3, target & 0xff, (target >> 8) & 0xff);
  };

  // Helper: emit CALL nn (3 bytes)
  const emitCALL = (target: number) => {
    push(0xcd, target & 0xff, (target >> 8) & 0xff);
  };

  // ============================================================
  // $0000: JP init — skip past ISR and KEYIN entry points
  // ============================================================
  const initJpAddr = pos();
  emitJP(0x0000); // placeholder — patched after init code is emitted

  // ============================================================
  // $0003-$0037: padding (NOPs, never executed)
  // ============================================================
  while (pos() < 0x38) push(0x00);

  // ============================================================
  // $0038: Timer Interrupt Service Routine
  //
  // The TRS-80 fires a maskable interrupt (IM 1 → RST $38) at ~40 Hz.
  // ML programs that enable interrupts (EI) will crash if no valid
  // ISR exists here. This minimal handler acknowledges the interrupt
  // by reading port $FF (clears the pending flag) and returns.
  // ============================================================
  push(0xf5);              // PUSH AF
  push(0xdb, 0xff);        // IN A,($FF) — acknowledge interrupt, clear pending flag
  push(0xf1);              // POP AF
  push(0xfb);              // EI
  push(0xed, 0x4d);        // RETI

  // ============================================================
  // $003F-$0048: padding to reach $0049
  // ============================================================
  while (pos() < 0x49) push(0x00);

  // ============================================================
  // $0049: KEYIN — standard ROM entry point for keyboard input
  //
  // Many TRS-80 ML programs CALL $0049 to read a key. This stub
  // provides a working implementation: poll matrix, decode to ASCII,
  // wait for release, return ASCII in A.
  // ============================================================
  const keyinEntryAddr = pos(); // should be $0049
  emitJP(0x0000); // placeholder — patched after keyin_impl is emitted

  // ============================================================
  // Initialization — target of JP at $0000
  // ============================================================
  const init = pos();
  code[initJpAddr + 1] = init & 0xff;
  code[initJpAddr + 2] = (init >> 8) & 0xff;

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
  // Keyboard loop — uses KEYIN subroutine, then writes to video
  // ============================================================

  const kbLoop = pos();
  emitCALL(0x0000);        // CALL keyin_impl (placeholder — patched later)
  const kbCallAddr = pos() - 3;

  // A holds the ASCII code. Check ENTER before writing to video.
  push(0xfe, 0x0d);        // CP $0D
  const enterJr = pos();
  push(0x28, 0x00);        // JR Z,handle_enter (patch later)

  // write_char: A = character to write at cursor
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
  emitJP(kbLoop);          // JP kb_loop

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
  emitJP(kbLoop);          // JP kb_loop

  // Patch ENTER jump
  code[enterJr + 1] = (handleEnter - (enterJr + 2)) & 0xff;

  // ============================================================
  // keyin_impl: Poll keyboard, decode key, wait for release.
  // Returns ASCII code in A. Preserves BC, DE, HL.
  //
  // ENTER → $0D, SPACE → $20, letters/digits/punctuation → ASCII.
  // Unrecognized keys (SHIFT alone, arrows, etc.) are ignored
  // and polling continues until a mappable key is pressed.
  // ============================================================

  const keyinImpl = pos();

  // Patch the KEYIN entry at $0049 and the CALL in kb_loop
  code[keyinEntryAddr + 1] = keyinImpl & 0xff;
  code[keyinEntryAddr + 2] = (keyinImpl >> 8) & 0xff;
  code[kbCallAddr + 1] = keyinImpl & 0xff;
  code[kbCallAddr + 2] = (keyinImpl >> 8) & 0xff;

  // Save caller's registers (KEYIN should be transparent)
  push(0xc5);              // PUSH BC
  push(0xd5);              // PUSH DE
  push(0xe5);              // PUSH HL

  // --- Poll until any key is pressed ---
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

  // Save rows 3, 4, 5 to user RAM scratch space
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

  // Check ENTER (D register = row 6, bit 0) → return $0D
  push(0x7a);              // LD A,D
  push(0xcb, 0x47);        // BIT 0,A
  const kEnterJr = pos();
  push(0x20, 0x00);        // JR NZ,return_enter (patch)

  // Check SPACE (D register = row 6, bit 7) → return $20
  push(0x7a);              // LD A,D
  push(0xcb, 0x7f);        // BIT 7,A
  const kSpaceJr = pos();
  push(0x20, 0x00);        // JR NZ,return_space (patch)

  // Row 0 (C register): @=bit0, A=bit1, ... G=bit7 → base $40
  push(0x79);              // LD A,C
  push(0xb7);              // OR A
  const kRow0Jr = pos();
  push(0x28, 0x00);        // JR Z,kcheck_row1 (patch)
  push(0x26, 0x40);        // LD H,'@' ($40)
  const kFbJr1 = pos();
  push(0x18, 0x00);        // JR find_bit (patch)

  const kCheckRow1 = pos();
  push(0x7b);              // LD A,E
  push(0xb7);              // OR A
  const kRow1Jr = pos();
  push(0x28, 0x00);        // JR Z,kcheck_row2 (patch)
  push(0x26, 0x48);        // LD H,'H' ($48)
  const kFbJr2 = pos();
  push(0x18, 0x00);        // JR find_bit (patch)

  const kCheckRow2 = pos();
  push(0x78);              // LD A,B
  push(0xb7);              // OR A
  const kRow2Jr = pos();
  push(0x28, 0x00);        // JR Z,kcheck_row3 (patch)
  push(0x26, 0x50);        // LD H,'P' ($50)
  const kFbJr3 = pos();
  push(0x18, 0x00);        // JR find_bit (patch)

  const kCheckRow3 = pos();
  push(0x3a, 0x02, 0x40); // LD A,($4002)
  push(0xb7);              // OR A
  const kRow3Jr = pos();
  push(0x28, 0x00);        // JR Z,kcheck_row4 (patch)
  push(0x26, 0x58);        // LD H,'X' ($58)
  const kFbJr4 = pos();
  push(0x18, 0x00);        // JR find_bit (patch)

  const kCheckRow4 = pos();
  push(0x3a, 0x03, 0x40); // LD A,($4003)
  push(0xb7);              // OR A
  const kRow4Jr = pos();
  push(0x28, 0x00);        // JR Z,kcheck_row5 (patch)
  push(0x26, 0x30);        // LD H,'0' ($30)
  const kFbJr5 = pos();
  push(0x18, 0x00);        // JR find_bit (patch)

  const kCheckRow5 = pos();
  push(0x3a, 0x04, 0x40); // LD A,($4004)
  push(0xb7);              // OR A
  const kRow5Jr = pos();
  push(0x28, 0x00);        // JR Z,no_key (patch)
  push(0x26, 0x38);        // LD H,'8' ($38)
  // Fall through to find_bit

  // find_bit: A has row data, H has base ASCII char
  // Find lowest set bit, add to H for final ASCII code
  const kFindBit = pos();
  push(0x0e, 0xff);        // LD C,$FF (counter, becomes 0 on first INC)
  const kBitLoop = pos();
  push(0x0c);              // INC C
  push(0xcb, 0x3f);        // SRL A — shift right, bit 0 → carry
  push(0x30, (kBitLoop - (pos() + 2)) & 0xff); // JR NC,bit_loop
  // C = bit position. Final char = H + C
  push(0x7c);              // LD A,H (base char)
  push(0x81);              // ADD A,C (add bit position)
  // Fall through to keyin_return

  // keyin_return: A has the ASCII code — restore regs and return
  const keyinReturn = pos();
  push(0xe1);              // POP HL
  push(0xd1);              // POP DE
  push(0xc1);              // POP BC
  push(0xc9);              // RET

  // return_enter: return $0D in A
  const returnEnter = pos();
  push(0x3e, 0x0d);        // LD A,$0D
  push(0x18, (keyinReturn - (pos() + 2)) & 0xff); // JR keyin_return

  // return_space: return $20 in A
  const returnSpace = pos();
  push(0x3e, 0x20);        // LD A,$20
  push(0x18, (keyinReturn - (pos() + 2)) & 0xff); // JR keyin_return

  // no_key: unrecognized key (SHIFT alone, arrows, etc.) — poll again
  const noKey = pos();
  emitJP(pollKeyboard);    // JP poll (keep polling)

  // --- Patch forward references in keyin_impl ---
  code[kEnterJr + 1] = (returnEnter - (kEnterJr + 2)) & 0xff;
  code[kSpaceJr + 1] = (returnSpace - (kSpaceJr + 2)) & 0xff;
  code[kRow0Jr + 1] = (kCheckRow1 - (kRow0Jr + 2)) & 0xff;
  code[kFbJr1 + 1] = (kFindBit - (kFbJr1 + 2)) & 0xff;
  code[kRow1Jr + 1] = (kCheckRow2 - (kRow1Jr + 2)) & 0xff;
  code[kFbJr2 + 1] = (kFindBit - (kFbJr2 + 2)) & 0xff;
  code[kRow2Jr + 1] = (kCheckRow3 - (kRow2Jr + 2)) & 0xff;
  code[kFbJr3 + 1] = (kFindBit - (kFbJr3 + 2)) & 0xff;
  code[kRow3Jr + 1] = (kCheckRow4 - (kRow3Jr + 2)) & 0xff;
  code[kFbJr4 + 1] = (kFindBit - (kFbJr4 + 2)) & 0xff;
  code[kRow4Jr + 1] = (kCheckRow5 - (kRow4Jr + 2)) & 0xff;
  code[kFbJr5 + 1] = (kFindBit - (kFbJr5 + 2)) & 0xff;
  code[kRow5Jr + 1] = (noKey - (kRow5Jr + 2)) & 0xff;

  rom.set(code);
  return rom;
})();

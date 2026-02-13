/**
 * Apple-1 Diagnostic PROM Test ROMs
 *
 * These are minimal 6502 programs that replicate the functionality of the
 * Apple-1 diagnostic PROM set (screen fill, DRAM test, keyboard echo, hex monitor).
 *
 * The original diagnostic PROMs were designed by UncleBernie for Apple-1 builders
 * to diagnose hardware faults without requiring functional DRAM. These test ROMs
 * serve as emulator verification tests exercising the same I/O patterns.
 *
 * PIA registers:
 *   $D010 (KBD)   - Keyboard data register (read, bit 7 set = valid ASCII)
 *   $D011 (KBDCR) - Keyboard control register (bit 7 = key available)
 *   $D012 (DSP)   - Display data register (write, bit 7 set by hardware)
 *   $D013 (DSPCR) - Display control register (bit 7 = display ready)
 */

// PIA register addresses
export const PIA = {
  KBD: 0xd010,
  KBDCR: 0xd011,
  DSP: 0xd012,
  DSPCR: 0xd013,
} as const;

// Apple-1 display dimensions
export const DISPLAY = {
  COLS: 40,
  ROWS: 24,
  TOTAL: 40 * 24, // 960 characters
} as const;

/**
 * Screen Fill Test ROM
 *
 * Fills the display with printable ASCII characters cycling from $20 (space)
 * through $5F (underscore) — the full Apple-1 displayable character set.
 * Outputs 960 characters (40 columns x 24 rows) to fill the entire screen.
 *
 * This replicates the diagnostic PROM "Terminal Section Test" which fills
 * the screen to detect faults in display shift registers.
 *
 * Origin: $FF00 (replaces Woz Monitor ROM space for testing)
 *
 * Assembly:
 *   FF00: A9 00     LDA #$00       ; counter low byte = 0
 *   FF02: 85 00     STA $00        ; store at zero page $00
 *   FF04: A9 04     LDA #$04       ; counter high = 4 (960 = $03C0, count down)
 *   FF06: 85 01     STA $01        ; store at zero page $01
 *   FF08: A2 C0     LDX #$C0       ; low byte of 960
 *   FF0A: A0 03     LDY #$03       ; high byte of 960
 *   FF0C: A9 20     LDA #$20       ; start with space character
 *   FF0E: 2C 12 D0  BIT $D012      ; check display ready (bit 7)
 *   FF11: 30 FB     BMI $FF0E      ; loop until DSP ready (bit 7 clear)
 *   FF13: 8D 12 D0  STA $D012      ; write character to display
 *   FF16: 18        CLC
 *   FF17: 69 01     ADC #$01       ; next character
 *   FF19: C9 60     CMP #$60       ; past underscore?
 *   FF1B: 90 02     BCC $FF1F      ; no, continue
 *   FF1D: A9 20     LDA #$20       ; yes, wrap back to space
 *   FF1F: CA        DEX            ; decrement counter low
 *   FF20: D0 EC     BNE $FF0E      ; continue if not zero
 *   FF22: 88        DEY            ; decrement counter high
 *   FF23: 10 E9     BPL $FF0E      ; continue if positive
 *   FF25: A9 0D     LDA #$0D       ; carriage return
 *   FF27: 2C 12 D0  BIT $D012      ; check display ready
 *   FF2A: 30 FB     BMI $FF27      ; loop until ready
 *   FF2C: 8D 12 D0  STA $D012      ; output CR to finalize
 *   FF27: 4C 27 FF  JMP $FF27      ; halt (infinite loop)
 *
 * Vectors at $FFFA:
 *   FFFA: 00 FF     NMI -> $FF00
 *   FFFC: 00 FF     RESET -> $FF00
 *   FFFE: 00 FF     IRQ -> $FF00
 */
export const SCREEN_FILL_ROM: Uint8Array = (() => {
  const rom = new Uint8Array(256).fill(0xea); // NOP fill

  // Program at offset 0 (address $FF00)
  const code = [
    0xa2, 0xc0, // LDX #$C0       ; counter low byte (960 = $03C0)
    0xa0, 0x03, // LDY #$03       ; counter high byte
    0xa9, 0x20, // LDA #$20       ; start char = space

    // output_loop ($FF06):
    0x2c, 0x12, 0xd0, // BIT $D012  ; check DSP ready
    0x30, 0xfb, // BMI $FF06       ; wait until bit 7 clear
    0x8d, 0x12, 0xd0, // STA $D012  ; write char to display

    0x18, // CLC
    0x69, 0x01, // ADC #$01       ; next character
    0xc9, 0x60, // CMP #$60       ; past $5F?
    0x90, 0x02, // BCC +2         ; no, skip reset
    0xa9, 0x20, // LDA #$20       ; wrap to space

    0xca, // DEX                   ; dec counter low
    0xd0, 0xec, // BNE output_loop
    0x88, // DEY                   ; dec counter high
    0x10, 0xe9, // BPL output_loop

    // Output final CR
    0xa9, 0x0d, // LDA #$0D       ; carriage return
    0x2c, 0x12, 0xd0, // BIT $D012
    0x30, 0xfb, // BMI -5          ; wait for ready
    0x8d, 0x12, 0xd0, // STA $D012  ; write CR

    // Halt (at $FF27)
    0x4c, 0x27, 0xff, // JMP $FF27  ; infinite loop (self-jump)
  ];

  rom.set(code, 0);

  // Set vectors at $FFFA (offset 0xFA in the 256-byte ROM)
  rom[0xfa] = 0x00; rom[0xfb] = 0xff; // NMI   -> $FF00
  rom[0xfc] = 0x00; rom[0xfd] = 0xff; // RESET -> $FF00
  rom[0xfe] = 0x00; rom[0xff] = 0xff; // IRQ   -> $FF00

  return rom;
})();

/**
 * DRAM Test ROM
 *
 * Tests the first 4KB of RAM ($0000-$0FFF, skipping stack area used minimally)
 * by writing and reading back test patterns. Reports pass/fail via display.
 *
 * Test patterns: $00, $FF, $55, $AA (all zeros, all ones, alternating bits)
 * On success, outputs 'P' (pass). On failure, outputs 'F' (fail).
 *
 * This replicates the diagnostic PROM "RAM Test" that provides syndrome
 * messages to identify faulty DRAM ICs.
 *
 * Assembly:
 *   FF00: A2 03     LDX #$03       ; pattern index 3..0
 *   FF02: BD 40 FF  LDA $FF40,X    ; load pattern from table
 *   FF05: A0 00     LDY #$00       ; page offset = 0
 *   FF07: 85 00     STA $00        ; store pattern in ZP for comparison
 *
 *   ; Write pattern to pages $02-$0F (skip ZP and stack)
 *   FF09: A9 02     LDA #$02       ; start page
 *   FF0B: 85 03     STA $03        ; page pointer high byte
 *   FF0D: A9 00     LDA #$00
 *   FF0F: 85 02     STA $02        ; page pointer low byte
 *
 *   ; Write loop
 *   FF11: A5 00     LDA $00        ; load pattern
 *   FF13: 91 02     STA ($02),Y    ; write to RAM
 *   FF15: C8        INY
 *   FF16: D0 F9     BNE $FF11      ; next byte in page
 *   FF18: E6 03     INC $03        ; next page
 *   FF1A: A5 03     LDA $03
 *   FF1C: C9 10     CMP #$10       ; reached $1000?
 *   FF1E: 90 F1     BCC $FF11      ; no, continue writing
 *
 *   ; Read-back and verify
 *   FF20: A9 02     LDA #$02       ; reset to page $02
 *   FF22: 85 03     STA $03
 *   FF24: A0 00     LDY #$00
 *   FF26: B1 02     LDA ($02),Y    ; read back
 *   FF28: C5 00     CMP $00        ; compare with pattern
 *   FF2A: D0 1A     BNE $FF46      ; mismatch -> fail
 *   FF2C: C8        INY
 *   FF2D: D0 F7     BNE $FF26      ; next byte in page
 *   FF2F: E6 03     INC $03        ; next page
 *   FF31: A5 03     LDA $03
 *   FF33: C9 10     CMP #$10       ; reached $1000?
 *   FF35: 90 EF     BCC $FF26      ; no, continue reading
 *
 *   ; Pattern passed, next pattern
 *   FF37: CA        DEX            ; X: 3->2->1->0->$FF
 *   FF38: 10 C8     BPL $FF02      ; loop while X >= 0
 *
 *   ; All patterns passed - output 'P'
 *   FF3A: A9 D0     LDA #$D0       ; 'P' with bit 7 set (Apple-1 convention)
 *   FF3C: 4C 48 FF  JMP $FF48      ; -> output
 *
 *   ; Pattern table at $FF40
 *   FF40: 00 FF 55 AA
 *
 *   ; Test failed at $FF46
 *   FF46: A9 C6     LDA #$C6       ; 'F' with bit 7 set
 *
 *   ; Output result at $FF48
 *   FF48: 2C 12 D0  BIT $D012
 *   FF4B: 30 FB     BMI $FF48
 *   FF4D: 8D 12 D0  STA $D012
 *   FF50: 4C 50 FF  JMP $FF50      ; halt
 */
export const DRAM_TEST_ROM: Uint8Array = (() => {
  const rom = new Uint8Array(256).fill(0xea); // NOP fill

  const code = [
    // $FF00: Initialize
    0xa2, 0x03, // LDX #$03       ; pattern index 3..0 (4 patterns)
    // $FF02: Load next pattern
    0xbd, 0x40, 0xff, // LDA $FF40,X ; load pattern
    0x85, 0x00, // STA $00        ; save pattern
    0xa0, 0x00, // LDY #$00       ; byte offset

    // $FF09: Set up write pointer at page $02
    0xa9, 0x02, // LDA #$02
    0x85, 0x03, // STA $03        ; high byte of pointer
    0xa9, 0x00, // LDA #$00
    0x85, 0x02, // STA $02        ; low byte of pointer

    // $FF11: Write loop
    0xa5, 0x00, // LDA $00        ; load pattern
    0x91, 0x02, // STA ($02),Y    ; write to RAM
    0xc8, // INY
    0xd0, 0xf9, // BNE $FF11      ; same page
    0xe6, 0x03, // INC $03        ; next page
    0xa5, 0x03, // LDA $03
    0xc9, 0x10, // CMP #$10       ; done?
    0x90, 0xf1, // BCC $FF11

    // $FF20: Set up read pointer at page $02
    0xa9, 0x02, // LDA #$02
    0x85, 0x03, // STA $03
    0xa0, 0x00, // LDY #$00

    // $FF26: Read-verify loop
    0xb1, 0x02, // LDA ($02),Y    ; read back
    0xc5, 0x00, // CMP $00        ; compare
    0xd0, 0x1a, // BNE fail ($FF46)
    0xc8, // INY
    0xd0, 0xf7, // BNE $FF26      ; same page
    0xe6, 0x03, // INC $03        ; next page
    0xa5, 0x03, // LDA $03
    0xc9, 0x10, // CMP #$10       ; done?
    0x90, 0xef, // BCC $FF26

    // $FF37: Pattern complete
    0xca, // DEX                   ; X: 3->2->1->0->$FF
    0x10, 0xc8, // BPL $FF02      ; loop while X >= 0 (4 patterns)

    // $FF3A: All passed -> 'P'
    0xa9, 0xd0, // LDA #$D0       ; 'P' | $80
    0x4c, 0x48, 0xff, // JMP output

    // $FF3F: padding
    0xea, // NOP

    // $FF40: Pattern table
    0x00, 0xff, 0x55, 0xaa,

    // $FF44: padding
    0xea, 0xea,

    // $FF46: Fail -> 'F'
    0xa9, 0xc6, // LDA #$C6       ; 'F' | $80

    // $FF48: Output character
    0x2c, 0x12, 0xd0, // BIT $D012
    0x30, 0xfb, // BMI $FF48
    0x8d, 0x12, 0xd0, // STA $D012

    // $FF50: Halt
    0x4c, 0x50, 0xff, // JMP $FF50
  ];

  rom.set(code, 0);

  // Vectors
  rom[0xfa] = 0x00; rom[0xfb] = 0xff; // NMI   -> $FF00
  rom[0xfc] = 0x00; rom[0xfd] = 0xff; // RESET -> $FF00
  rom[0xfe] = 0x00; rom[0xff] = 0xff; // IRQ   -> $FF00

  return rom;
})();

/**
 * Keyboard Echo (TV Typewriter) Test ROM
 *
 * Reads keyboard input and echoes it to the display. This replicates the
 * diagnostic PROM "TV Typewriter" that allows basic keyboard verification.
 *
 * Assembly:
 *   FF00: 2C 11 D0  BIT $D011      ; check KBDCR bit 7
 *   FF03: 10 FB     BPL $FF00      ; loop until key available
 *   FF05: AD 10 D0  LDA $D010      ; read key (clears KBDCR bit 7)
 *   FF08: 2C 12 D0  BIT $D012      ; check DSP ready
 *   FF0B: 30 FB     BMI $FF08      ; wait until ready
 *   FF0D: 8D 12 D0  STA $D012      ; echo to display
 *   FF10: 4C 00 FF  JMP $FF00      ; loop forever
 */
export const KEYBOARD_ECHO_ROM: Uint8Array = (() => {
  const rom = new Uint8Array(256).fill(0xea); // NOP fill

  const code = [
    // $FF00: Wait for key
    0x2c, 0x11, 0xd0, // BIT $D011     ; check keyboard ready
    0x10, 0xfb, // BPL $FF00            ; wait for key
    0xad, 0x10, 0xd0, // LDA $D010     ; read key

    // $FF08: Wait for display ready
    0x2c, 0x12, 0xd0, // BIT $D012     ; check display ready
    0x30, 0xfb, // BMI $FF08            ; wait until ready

    // $FF0D: Echo character
    0x8d, 0x12, 0xd0, // STA $D012     ; write to display
    0x4c, 0x00, 0xff, // JMP $FF00     ; loop
  ];

  rom.set(code, 0);

  // Vectors
  rom[0xfa] = 0x00; rom[0xfb] = 0xff; // NMI   -> $FF00
  rom[0xfc] = 0x00; rom[0xfd] = 0xff; // RESET -> $FF00
  rom[0xfe] = 0x00; rom[0xff] = 0xff; // IRQ   -> $FF00

  return rom;
})();

/**
 * Hex Monitor Test ROM
 *
 * A minimal hex monitor that operates without using RAM (register-only
 * housekeeping). Reads two hex keystrokes and displays the corresponding
 * byte value at a fixed address, then loops. This replicates the
 * diagnostic PROM "Hex Monitor" used for RAM-independent peek/poke.
 *
 * For test purposes, this simplified version:
 * 1. Reads a hex digit from keyboard
 * 2. Echoes it to display
 * 3. Reads a second hex digit
 * 4. Echoes it to display
 * 5. Outputs '=' followed by the combined byte value
 * 6. Outputs CR and loops
 *
 * Assembly:
 *   FF00: 20 20 FF  JSR get_hex    ; get first nibble -> X
 *   FF03: 8A        TXA
 *   FF04: 0A        ASL A
 *   FF05: 0A        ASL A
 *   FF06: 0A        ASL A
 *   FF07: 0A        ASL A          ; shift to high nibble
 *   FF08: AA        TAX            ; save in X
 *   FF09: 20 20 FF  JSR get_hex    ; get second nibble -> result in X low
 *   FF0C: 8A        TXA
 *   FF0D: 05 00     ORA $00 (actually use stack trick... simplified)
 *   ...
 *
 * Simplified for testing - just echoes two keystrokes and outputs '=':
 */
export const HEX_MONITOR_ROM: Uint8Array = (() => {
  const rom = new Uint8Array(256).fill(0xea); // NOP fill

  const code = [
    // $FF00: Read first key
    0x2c, 0x11, 0xd0, // BIT $D011
    0x10, 0xfb, // BPL $FF00
    0xad, 0x10, 0xd0, // LDA $D010     ; read first hex digit

    // $FF08: Echo first digit
    0x2c, 0x12, 0xd0, // BIT $D012
    0x30, 0xfb, // BMI $FF08
    0x8d, 0x12, 0xd0, // STA $D012     ; echo first digit

    0xaa, // TAX                        ; save in X

    // $FF10: Read second key
    0x2c, 0x11, 0xd0, // BIT $D011
    0x10, 0xfb, // BPL $FF10
    0xad, 0x10, 0xd0, // LDA $D010     ; read second hex digit

    // $FF18: Echo second digit
    0x2c, 0x12, 0xd0, // BIT $D012
    0x30, 0xfb, // BMI $FF18
    0x8d, 0x12, 0xd0, // STA $D012     ; echo second digit

    // $FF1F: Output '='
    0xa9, 0xbd, // LDA #$BD             ; '=' | $80
    0x2c, 0x12, 0xd0, // BIT $D012
    0x30, 0xfb, // BMI $FF23 (self)
    0x8d, 0x12, 0xd0, // STA $D012

    // $FF29: Output CR
    0xa9, 0x8d, // LDA #$8D             ; CR | $80
    0x2c, 0x12, 0xd0, // BIT $D012
    0x30, 0xfb, // BMI $FF2B (self)
    0x8d, 0x12, 0xd0, // STA $D012

    // $FF33: Loop
    0x4c, 0x00, 0xff, // JMP $FF00
  ];

  rom.set(code, 0);

  // Vectors
  rom[0xfa] = 0x00; rom[0xfb] = 0xff; // NMI   -> $FF00
  rom[0xfc] = 0x00; rom[0xfd] = 0xff; // RESET -> $FF00
  rom[0xfe] = 0x00; rom[0xff] = 0xff; // IRQ   -> $FF00

  return rom;
})();

/**
 * Altair 8800 Turnkey Bootstrap ROM
 *
 * A small bootstrap program that initializes the 2SIO serial board
 * and provides an echo loop. When loaded at address 0x0000, it:
 *   1. Initializes the 2SIO ACIA (port 0x10)
 *   2. Outputs a greeting message
 *   3. Enters a serial echo loop (reads char, echoes it back)
 *
 * This provides immediate interactive feedback when the machine starts,
 * similar to the TRS-80's stub ROM.
 */

/**
 * Turnkey boot ROM bytes.
 *
 * Assembly:
 *   ORG 0000h
 *   ; Initialize 2SIO (reset ACIA)
 *   MVI A, 03h     ; Master reset
 *   OUT 10h        ; Send to 2SIO control
 *   MVI A, 15h     ; 8N1, no interrupt
 *   OUT 10h        ; Configure ACIA
 *
 *   ; Print greeting
 *   LXI H, msg     ; Point HL to message
 * ploop:
 *   MOV A, M       ; Load character
 *   ORA A          ; Test for null terminator
 *   JZ echo        ; Done with message
 *   CALL putchar   ; Output character
 *   INX H          ; Next character
 *   JMP ploop
 *
 * echo:
 *   IN 10h         ; Read 2SIO status
 *   ANI 01h        ; Check RDRF bit
 *   JZ echo        ; No data, loop
 *   IN 11h         ; Read character
 *   OUT 11h        ; Echo it back
 *   CPI 0Dh        ; Carriage return?
 *   JNZ echo       ; No, keep echoing
 *   MVI A, 0Ah     ; Add line feed
 *   OUT 11h
 *   JMP echo
 *
 * putchar:
 *   PUSH PSW
 * pwait:
 *   IN 10h         ; Read status
 *   ANI 02h        ; Check TDRE bit
 *   JZ pwait       ; Wait for TX ready
 *   POP PSW
 *   OUT 11h        ; Send character
 *   RET
 *
 * msg:
 *   DB "ALTAIR 8800", 0Dh, 0Ah
 *   DB "READY", 0Dh, 0Ah, 00h
 */
export const TURNKEY_BOOT_ROM = new Uint8Array([
  // 0000: MVI A, 03h  — ACIA master reset
  0x3e, 0x03,
  // 0002: OUT 10h
  0xd3, 0x10,
  // 0004: MVI A, 15h  — 8N1, no interrupt
  0x3e, 0x15,
  // 0006: OUT 10h
  0xd3, 0x10,

  // 0008: LXI H, msg (address of message = 0x0031)
  0x21, 0x31, 0x00,

  // 000B: ploop — MOV A, M
  0x7e,
  // 000C: ORA A
  0xb7,
  // 000D: JZ echo (0x0017)
  0xca, 0x17, 0x00,
  // 0010: CALL putchar (0x0025)
  0xcd, 0x25, 0x00,
  // 0013: INX H
  0x23,
  // 0014: JMP ploop (0x000B)
  0xc3, 0x0b, 0x00,

  // 0017: echo — IN 10h
  0xdb, 0x10,
  // 0019: ANI 01h
  0xe6, 0x01,
  // 001B: JZ echo (0x0017)
  0xca, 0x17, 0x00,
  // 001E: IN 11h — read character
  0xdb, 0x11,
  // 0020: OUT 11h — echo it
  0xd3, 0x11,
  // 0022: JMP echo (0x0017)
  0xc3, 0x17, 0x00,

  // 0025: putchar — PUSH PSW
  0xf5,
  // 0026: pwait — IN 10h
  0xdb, 0x10,
  // 0028: ANI 02h
  0xe6, 0x02,
  // 002A: JZ pwait (0x0026)
  0xca, 0x26, 0x00,
  // 002D: POP PSW
  0xf1,
  // 002E: OUT 11h
  0xd3, 0x11,
  // 0030: RET
  0xc9,

  // 0031: msg — "ALTAIR 8800\r\nREADY\r\n\0"
  0x41, 0x4c, 0x54, 0x41, 0x49, 0x52, 0x20, // "ALTAIR "
  0x38, 0x38, 0x30, 0x30,                     // "8800"
  0x0d, 0x0a,                                 // "\r\n"
  0x52, 0x45, 0x41, 0x44, 0x59,               // "READY"
  0x0d, 0x0a,                                 // "\r\n"
  0x00,                                        // null terminator
]);

/** Load address for the turnkey boot ROM. */
export const TURNKEY_BOOT_ADDRESS = 0x0000;

/** Entry point for the turnkey boot ROM. */
export const TURNKEY_BOOT_ENTRY = 0x0000;

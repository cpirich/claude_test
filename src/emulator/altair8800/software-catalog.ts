/**
 * Altair 8800 Software Catalog — Built-in + remote program library
 */

import type { SoftwareEntry } from '../apple1/software-library';
import {
  TURNKEY_BOOT_ROM,
  TURNKEY_BOOT_ADDRESS,
  TURNKEY_BOOT_ENTRY,
} from './roms/turnkey-boot';

/** Built-in Altair 8800 entries. */
export const ALTAIR_SOFTWARE_CATALOG: SoftwareEntry[] = [
  {
    id: 'altair-turnkey-boot',
    name: 'TURNKEY BOOT',
    description:
      'Minimal bootstrap ROM that initializes the 2SIO serial board, prints a greeting, and enters a serial echo loop.',
    category: 'utility',
    regions: [
      { startAddress: TURNKEY_BOOT_ADDRESS, data: TURNKEY_BOOT_ROM },
    ],
    entryPoint: TURNKEY_BOOT_ENTRY,
    author: 'Emulator',
    sizeBytes: TURNKEY_BOOT_ROM.length,
    addressRange: '$0000-$0044',
    isStub: true,
    machine: 'altair8800',
    loadInstructions:
      'Loads automatically. Outputs "ALTAIR 8800" and "READY" to the serial terminal, then echoes keyboard input.',
  },
  {
    id: 'altair-kill-the-bit',
    name: 'KILL THE BIT',
    description:
      'Classic front panel game by Dean McDaniel (1975). A single lit LED rotates across the address LEDs. Press the corresponding sense switch at the right moment to turn it off. Kill all the bits to win!',
    category: 'game',
    regions: [
      {
        startAddress: 0x0000,
        data: new Uint8Array([
          // Kill the Bit — original 1975 program
          // ORG 0000h
          0x21, 0x00, 0x00, // LXI H, 0000h    ; Initial bit position
          0x16, 0x80,       // MVI D, 80h      ; Initial rotating bit
          0x01, 0x0e, 0x00, // LXI B, 000Eh    ; Delay counter
          // loop:
          0x1a,             // LDAX D          ; (not meaningful, just timing)
          0xd3, 0xff,       // OUT FFh         ; Display on front panel LEDs
          0x0b,             // DCX B           ; Decrement delay
          0x78,             // MOV A, B        ; Check if delay expired
          0xb1,             // ORA C
          0xc2, 0x08, 0x00, // JNZ loop        ; Keep looping if not zero
          0xdb, 0xff,       // IN FFh          ; Read sense switches
          0xaa,             // XRA D           ; XOR with current bit
          0x57,             // MOV D, A        ; Store result
          0x0f,             // RRC             ; Rotate right
          0x57,             // MOV D, A        ; Update D with rotated value
          0x01, 0x0e, 0x00, // LXI B, 000Eh    ; Reset delay
          0xc3, 0x08, 0x00, // JMP loop        ; Repeat
        ]),
      },
    ],
    entryPoint: 0x0000,
    author: 'Dean McDaniel',
    year: 1975,
    sizeBytes: 25,
    addressRange: '$0000-$0018',
    isStub: false,
    machine: 'altair8800',
    loadInstructions:
      'Click RUN to start. Watch the address LEDs — a bit pattern rotates. Use the sense switches (D7-D0) to "kill" each lit bit. The goal is to turn off all bits.',
  },
];

/** Remote Altair 8800 entries fetched on demand. */
export const ALTAIR_REMOTE_CATALOG: SoftwareEntry[] = [
  {
    id: 'altair-basic-4k',
    name: 'ALTAIR BASIC 4K',
    description:
      'Original 4K BASIC interpreter by Bill Gates, Paul Allen, and Monte Davidoff (1975). The first product sold by Micro-Soft. Requires serial terminal.',
    category: 'language',
    regions: [],
    entryPoint: 0x0000,
    author: 'Micro-Soft (Gates, Allen, Davidoff)',
    year: 1975,
    sizeBytes: 3833,
    addressRange: '$0000-$0EF8',
    isStub: false,
    url: 'https://raw.githubusercontent.com/kevinthecheung/py8080/main/altair_basic_bin/4kbas40.bin',
    format: 'binary',
    defaultLoadAddress: 0x0000,
    machine: 'altair8800',
    notes:
      'Downloads Altair BASIC 4K v4.0 ROM image from kevinthecheung/py8080 project. Requires 2SIO serial terminal for interaction.',
    loadInstructions:
      'Boots to "MEMORY SIZE?" prompt in the serial terminal. Press ENTER for default. Then type BASIC commands at OK prompt.',
  },
  {
    id: 'altair-basic-8k',
    name: 'ALTAIR BASIC 8K',
    description:
      'Extended 8K BASIC with floating point math, string handling, and additional commands. The premium version of Altair BASIC.',
    category: 'language',
    regions: [],
    entryPoint: 0x0000,
    author: 'Micro-Soft (Gates, Allen, Davidoff)',
    year: 1975,
    sizeBytes: 8192,
    addressRange: '$0000-$1FFF',
    isStub: false,
    url: 'https://raw.githubusercontent.com/kevinthecheung/py8080/main/altair_basic_bin/8kbas.bin',
    format: 'binary',
    defaultLoadAddress: 0x0000,
    machine: 'altair8800',
    notes:
      'Downloads Altair BASIC 8K ROM image from kevinthecheung/py8080 project. Adds floating point and string operations over 4K BASIC.',
    loadInstructions:
      'Boots to "MEMORY SIZE?" prompt. Press ENTER for default. Supports floating point: PRINT 3.14 * 2, SIN(1), etc.',
  },
];

/** Get the full Altair 8800 catalog: built-in + remote entries. */
export function getAltairFullCatalog(): SoftwareEntry[] {
  return [...ALTAIR_SOFTWARE_CATALOG, ...ALTAIR_REMOTE_CATALOG];
}

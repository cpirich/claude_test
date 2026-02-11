/**
 * TRS-80 Model I Software Catalog — Built-in + remote program library
 */

import type { SoftwareEntry } from '../apple1/software-library';

/** Built-in TRS-80 entries (stub ROM, etc.). */
export const TRS80_SOFTWARE_CATALOG: SoftwareEntry[] = [
  {
    id: 'trs80-stub-rom',
    name: 'STUB ROM',
    description:
      'Minimal built-in ROM that clears the screen, displays READY, and echoes keyboard input. Does not provide BASIC.',
    category: 'utility',
    regions: [], // Already loaded by default
    entryPoint: 0x0000,
    author: 'Emulator',
    sizeBytes: 0,
    addressRange: '$0000-$2FFF',
    isStub: true,
    machine: 'trs80',
    loadInstructions: 'Already loaded. Type letters and they appear on screen. ENTER moves to next line.',
  },
];

/** Remote TRS-80 entries fetched on demand. */
export const TRS80_REMOTE_CATALOG: SoftwareEntry[] = [
  {
    id: 'trs80-level2-basic',
    name: 'LEVEL II BASIC',
    description:
      'Authentic 12KB Level II BASIC ROM by Microsoft. Full BASIC interpreter with string handling, arrays, graphics, and cassette I/O.',
    category: 'language',
    regions: [],
    entryPoint: 0x0000,
    author: 'Microsoft',
    year: 1978,
    sizeBytes: 12288,
    addressRange: '$0000-$2FFF',
    isStub: false,
    url: 'https://raw.githubusercontent.com/lkesteloot/trs80/master/packages/trs80-emulator/roms/model1-level2.rom',
    format: 'binary',
    defaultLoadAddress: 0x0000,
    machine: 'trs80',
    notes: 'Downloads from the lkesteloot/trs80 project (MIT license). Replaces stub ROM.',
    loadInstructions: 'Boots to "MEMORY SIZE?" prompt. Press ENTER to accept default. Then type BASIC commands at READY prompt (e.g., PRINT "HELLO", FOR I=1 TO 10:PRINT I:NEXT).',
  },
  {
    id: 'trs80-level1-basic',
    name: 'LEVEL I BASIC',
    description:
      'Original 4KB Level I BASIC ROM. Simpler than Level II — integer-only math, no string variables, limited editing. The ROM that shipped with early Model I units.',
    category: 'language',
    regions: [],
    entryPoint: 0x0000,
    author: 'Steve Leininger',
    year: 1977,
    sizeBytes: 4096,
    addressRange: '$0000-$0FFF',
    isStub: false,
    url: 'https://raw.githubusercontent.com/lkesteloot/trs80/master/packages/trs80-emulator/roms/model1-level1.rom',
    format: 'binary',
    defaultLoadAddress: 0x0000,
    machine: 'trs80',
    notes: 'Downloads from the lkesteloot/trs80 project (MIT license). Replaces current ROM.',
    loadInstructions: 'Boots to READY prompt. Supports integer BASIC only. Try: PRINT 2+2 or 10 FOR I=1 TO 10: PRINT I: NEXT I then RUN.',
  },
  {
    id: 'trs80-diagnostic',
    name: 'DIAGNOSTIC ROM',
    description:
      'Hardware diagnostic ROM for TRS-80 Model I/III. Tests RAM, video, and keyboard. Useful for verifying emulator correctness.',
    category: 'diagnostic',
    regions: [],
    entryPoint: 0x0000,
    author: 'MisterBlack',
    sizeBytes: 1317,
    addressRange: '$0000-$0524',
    isStub: false,
    url: 'https://raw.githubusercontent.com/misterblack1/trs80-diagnosticrom/main/trs80m13diag.bin',
    format: 'binary',
    defaultLoadAddress: 0x0000,
    machine: 'trs80',
    notes: 'Downloads from the misterblack1/trs80-diagnosticrom project. Replaces current ROM.',
    loadInstructions: 'Runs automatically. Tests RAM patterns and displays results on screen. Watch for PASS/FAIL indicators.',
  },
];

/** Get the full TRS-80 catalog: built-in + remote entries. */
export function getTrs80FullCatalog(): SoftwareEntry[] {
  return [...TRS80_SOFTWARE_CATALOG, ...TRS80_REMOTE_CATALOG];
}

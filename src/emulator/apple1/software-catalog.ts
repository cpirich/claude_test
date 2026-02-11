/**
 * Apple I Software Catalog — Built-in + remote program library
 */

import type { SoftwareEntry, SoftwareCategory } from './software-library';
import {
  SCREEN_FILL_ROM,
  DRAM_TEST_ROM,
  KEYBOARD_ECHO_ROM,
  HEX_MONITOR_ROM,
} from './roms/diagnostic-roms';
import { APPLE1_REMOTE_CATALOG } from './remote-catalog';

/** The full software catalog. */
export const APPLE1_SOFTWARE_CATALOG: SoftwareEntry[] = [
  {
    id: 'woz-monitor',
    name: 'WOZ MONITOR',
    description:
      'Built-in system monitor. Examine/deposit memory, run programs. Already loaded in ROM.',
    category: 'utility',
    regions: [], // No regions — always present in ROM
    entryPoint: 0xff00,
    author: 'Steve Wozniak',
    year: 1976,
    sizeBytes: 256,
    addressRange: '$FF00-$FFFF',
    isStub: false,
    notes: 'The Woz Monitor is always present in ROM and does not need to be loaded.',
    loadInstructions: 'Already in ROM. Type addresses to examine memory (e.g. FF00), or ADDR.ADDR to dump a range. Type ADDRR to run a program.',
  },
  {
    id: 'screen-fill',
    name: 'SCREEN FILL TEST',
    description:
      'Fills the 40x24 display with cycling ASCII characters ($20-$5F). Detects display shift register faults.',
    category: 'diagnostic',
    regions: [{ startAddress: 0xff00, data: SCREEN_FILL_ROM }],
    entryPoint: 0xff00,
    author: 'Diagnostic PROM',
    year: 1976,
    sizeBytes: 256,
    addressRange: '$FF00-$FFFF',
    isStub: false,
    notes: 'Replaces Woz Monitor ROM when loaded.',
    loadInstructions: 'Runs automatically. Display fills with cycling characters. Load WOZ MONITOR to restore normal operation.',
  },
  {
    id: 'dram-test',
    name: 'DRAM TEST',
    description:
      'Tests RAM ($0200-$0FFF) with 4 patterns ($00, $FF, $55, $AA). Outputs P (pass) or F (fail).',
    category: 'diagnostic',
    regions: [{ startAddress: 0xff00, data: DRAM_TEST_ROM }],
    entryPoint: 0xff00,
    author: 'Diagnostic PROM',
    year: 1976,
    sizeBytes: 256,
    addressRange: '$FF00-$FFFF',
    isStub: false,
    notes: 'Replaces Woz Monitor ROM when loaded.',
    loadInstructions: 'Runs automatically. Displays P (pass) or F (fail) for each RAM test pattern. Load WOZ MONITOR to restore normal operation.',
  },
  {
    id: 'keyboard-echo',
    name: 'KEYBOARD ECHO',
    description:
      'TV Typewriter: reads keyboard input and echoes each character to the display.',
    category: 'diagnostic',
    regions: [{ startAddress: 0xff00, data: KEYBOARD_ECHO_ROM }],
    entryPoint: 0xff00,
    author: 'Diagnostic PROM',
    year: 1976,
    sizeBytes: 256,
    addressRange: '$FF00-$FFFF',
    isStub: false,
    notes: 'Replaces Woz Monitor ROM when loaded.',
    loadInstructions: 'Runs automatically. Type any key and it echoes to the display. Load WOZ MONITOR to restore normal operation.',
  },
  {
    id: 'hex-monitor',
    name: 'HEX MONITOR',
    description:
      'Minimal hex monitor. Reads two hex keystrokes, echoes them with = separator.',
    category: 'diagnostic',
    regions: [{ startAddress: 0xff00, data: HEX_MONITOR_ROM }],
    entryPoint: 0xff00,
    author: 'Diagnostic PROM',
    year: 1976,
    sizeBytes: 256,
    addressRange: '$FF00-$FFFF',
    isStub: false,
    notes: 'Replaces Woz Monitor ROM when loaded.',
    loadInstructions: 'Runs automatically. Type two hex digits and they echo with = separator. Load WOZ MONITOR to restore normal operation.',
  },
];

/** Get catalog entries filtered by category. */
export function getCatalogByCategory(
  category: SoftwareCategory
): SoftwareEntry[] {
  return APPLE1_SOFTWARE_CATALOG.filter((e) => e.category === category);
}

/** Get a single catalog entry by id. */
export function getCatalogEntry(id: string): SoftwareEntry | undefined {
  return APPLE1_SOFTWARE_CATALOG.find((e) => e.id === id);
}

/** Get the full catalog: built-in entries + remote entries. */
export function getFullCatalog(): SoftwareEntry[] {
  return [...APPLE1_SOFTWARE_CATALOG, ...APPLE1_REMOTE_CATALOG];
}

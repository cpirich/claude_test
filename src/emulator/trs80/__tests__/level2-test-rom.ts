import { readFileSync } from 'fs';
import { join } from 'path';

/** Cache decoded ROM so we only read the file once per test run. */
let cachedRom: Uint8Array | null = null;

/**
 * Load the Level II BASIC ROM from the binary file in roms/.
 * Falls back to fetching from /tmp for initial test development.
 */
export function decodeLevel2ROM(): Uint8Array {
  if (cachedRom) return cachedRom;
  const romPath = join(__dirname, '..', 'roms', 'level2.rom');
  try {
    const buf = readFileSync(romPath);
    cachedRom = new Uint8Array(buf);
    return cachedRom;
  } catch {
    // Fallback: try /tmp (for development)
    const buf = readFileSync('/tmp/level2.rom');
    cachedRom = new Uint8Array(buf);
    return cachedRom;
  }
}

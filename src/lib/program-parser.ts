/**
 * Program File Format Parsers
 *
 * Parses binary, Intel HEX, and Woz Monitor hex dump formats into
 * MemoryRegion arrays suitable for loading into emulator memory.
 */

import type { MemoryRegion, ParsedProgram, ProgramFileFormat } from "@/emulator/apple1/software-library";

/** Format a 16-bit address as a hex string (e.g., "$0300"). */
function formatAddr(addr: number): string {
  return "$" + addr.toString(16).toUpperCase().padStart(4, "0");
}

/** Compute address range string from regions. */
function computeAddressRange(regions: MemoryRegion[]): string {
  if (regions.length === 0) return "$0000";
  let lo = 0xffff;
  let hi = 0x0000;
  for (const r of regions) {
    lo = Math.min(lo, r.startAddress);
    hi = Math.max(hi, r.startAddress + r.data.length - 1);
  }
  return lo === hi ? formatAddr(lo) : `${formatAddr(lo)}-${formatAddr(hi)}`;
}

/** Compute total byte size across all regions. */
function computeSize(regions: MemoryRegion[]): number {
  return regions.reduce((sum, r) => sum + r.data.length, 0);
}

/**
 * Auto-detect file format from content.
 *
 * - Intel HEX: first non-empty line starts with ':'
 * - Woz Monitor hex dump: first non-empty line matches /^[0-9A-Fa-f]{3,4}:/
 * - Otherwise: raw binary
 */
export function detectFormat(data: Uint8Array | string): ProgramFileFormat {
  const text = typeof data === "string" ? data : tryDecodeText(data);
  if (text === null) return "binary";

  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;

    if (trimmed.startsWith(":")) return "intel-hex";
    if (/^[0-9A-Fa-f]{3,4}:/.test(trimmed)) return "woz-hex-dump";

    // First non-empty line doesn't match text formats
    break;
  }
  return "binary";
}

/** Try to decode bytes as ASCII text. Returns null if it looks like binary. */
function tryDecodeText(data: Uint8Array): string | null {
  // If more than 10% of bytes are non-printable (excluding whitespace), it's binary
  let nonPrintable = 0;
  const limit = Math.min(data.length, 512); // check first 512 bytes
  for (let i = 0; i < limit; i++) {
    const b = data[i];
    if (b < 0x09 || (b > 0x0d && b < 0x20) || b > 0x7e) {
      nonPrintable++;
    }
  }
  if (limit > 0 && nonPrintable / limit > 0.1) return null;
  return new TextDecoder("utf-8").decode(data);
}

/**
 * Parse Intel HEX format.
 *
 * Record format: :LLAAAATT[DD...]CC
 * - LL: byte count
 * - AAAA: 16-bit address
 * - TT: record type (00=data, 01=EOF)
 * - DD: data bytes
 * - CC: checksum (two's complement of sum of all bytes)
 */
export function parseIntelHex(text: string): ParsedProgram {
  const bytes = new Map<number, number>(); // address -> byte

  const lines = text.split(/\r?\n/);
  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum].trim();
    if (line.length === 0) continue;
    if (!line.startsWith(":")) {
      throw new Error(`Intel HEX parse error on line ${lineNum + 1}: expected ':' prefix`);
    }

    const hex = line.slice(1);
    if (hex.length < 10 || hex.length % 2 !== 0) {
      throw new Error(`Intel HEX parse error on line ${lineNum + 1}: invalid length`);
    }

    const rawBytes: number[] = [];
    for (let i = 0; i < hex.length; i += 2) {
      const val = parseInt(hex.slice(i, i + 2), 16);
      if (isNaN(val)) {
        throw new Error(`Intel HEX parse error on line ${lineNum + 1}: invalid hex at position ${i}`);
      }
      rawBytes.push(val);
    }

    // Verify checksum
    const checksum = rawBytes.reduce((sum, b) => (sum + b) & 0xff, 0);
    if (checksum !== 0) {
      throw new Error(`Intel HEX checksum error on line ${lineNum + 1}`);
    }

    const byteCount = rawBytes[0];
    const address = (rawBytes[1] << 8) | rawBytes[2];
    const recordType = rawBytes[3];

    if (recordType === 0x01) break; // EOF
    if (recordType !== 0x00) continue; // skip unknown record types

    if (rawBytes.length - 5 !== byteCount) {
      throw new Error(`Intel HEX parse error on line ${lineNum + 1}: byte count mismatch`);
    }

    for (let i = 0; i < byteCount; i++) {
      bytes.set(address + i, rawBytes[4 + i]);
    }
  }

  const regions = buildRegions(bytes);
  return {
    regions,
    entryPoint: regions.length > 0 ? regions[0].startAddress : undefined,
    format: "intel-hex",
    sizeBytes: computeSize(regions),
    addressRange: computeAddressRange(regions),
  };
}

/**
 * Parse Woz Monitor-style hex dump.
 *
 * Format: "0300: A9 00 85 10 A2 20 86 11"
 * Lines starting with # or // are comments. Blank lines are ignored.
 */
export function parseWozHexDump(text: string): ParsedProgram {
  const bytes = new Map<number, number>();

  const lines = text.split(/\r?\n/);
  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum].trim();
    if (line.length === 0 || line.startsWith("#") || line.startsWith("//")) continue;

    const match = line.match(/^([0-9A-Fa-f]{3,4}):\s*(.*)/);
    if (!match) continue; // skip unrecognized lines

    let address = parseInt(match[1], 16);
    const hexBytes = match[2].trim();
    if (hexBytes.length === 0) continue;

    const tokens = hexBytes.split(/\s+/);
    for (const token of tokens) {
      const val = parseInt(token, 16);
      if (isNaN(val) || token.length !== 2) {
        throw new Error(`Woz hex dump parse error on line ${lineNum + 1}: invalid byte "${token}"`);
      }
      bytes.set(address, val);
      address++;
    }
  }

  const regions = buildRegions(bytes);
  return {
    regions,
    entryPoint: regions.length > 0 ? regions[0].startAddress : undefined,
    format: "woz-hex-dump",
    sizeBytes: computeSize(regions),
    addressRange: computeAddressRange(regions),
  };
}

/**
 * Parse raw binary data.
 *
 * Wraps the bytes into a single MemoryRegion at the given load address.
 */
export function parseBinary(data: Uint8Array, loadAddress: number): ParsedProgram {
  const regions: MemoryRegion[] = [{ startAddress: loadAddress, data }];
  return {
    regions,
    entryPoint: loadAddress,
    format: "binary",
    sizeBytes: data.length,
    addressRange: computeAddressRange(regions),
  };
}

/**
 * Unified parse function. Auto-detects format if not specified.
 */
export function parseProgram(
  data: Uint8Array | string,
  options?: { format?: ProgramFileFormat; loadAddress?: number }
): ParsedProgram {
  const format = options?.format ?? detectFormat(data);
  switch (format) {
    case "intel-hex": {
      const text = typeof data === "string" ? data : new TextDecoder("utf-8").decode(data);
      return parseIntelHex(text);
    }
    case "woz-hex-dump": {
      const text = typeof data === "string" ? data : new TextDecoder("utf-8").decode(data);
      return parseWozHexDump(text);
    }
    case "binary": {
      const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
      return parseBinary(bytes, options?.loadAddress ?? 0x0300);
    }
  }
}

/**
 * Build contiguous MemoryRegion arrays from a sparse byte map.
 * Groups consecutive addresses into single regions.
 */
function buildRegions(bytes: Map<number, number>): MemoryRegion[] {
  if (bytes.size === 0) return [];

  const addresses = Array.from(bytes.keys()).sort((a, b) => a - b);
  const regions: MemoryRegion[] = [];

  let regionStart = addresses[0];
  let regionBytes: number[] = [bytes.get(addresses[0])!];

  for (let i = 1; i < addresses.length; i++) {
    const addr = addresses[i];
    const prevAddr = addresses[i - 1];

    if (addr === prevAddr + 1) {
      // Contiguous — extend current region
      regionBytes.push(bytes.get(addr)!);
    } else {
      // Gap — flush current region and start new one
      regions.push({
        startAddress: regionStart,
        data: new Uint8Array(regionBytes),
      });
      regionStart = addr;
      regionBytes = [bytes.get(addr)!];
    }
  }

  // Flush final region
  regions.push({
    startAddress: regionStart,
    data: new Uint8Array(regionBytes),
  });

  return regions;
}

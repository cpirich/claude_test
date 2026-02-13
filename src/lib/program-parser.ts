/**
 * Program File Format Parsers
 *
 * Parses binary, Intel HEX, and Woz Monitor hex dump formats into
 * MemoryRegion arrays suitable for loading into emulator memory.
 */

import type { MemoryRegion, ParsedProgram, ProgramFileFormat } from "@/emulator/apple1/software-library";
import { parseTRS80BAS } from "./trs80-bas-parser";
import { parseTRS80CMD } from "./trs80-cmd-parser";

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
 * - TRS-80 CMD: starts with 0x01 (data block record type)
 * - TRS-80 BAS: starts with D3 D3 D3 (tokenized) or looks like plain text BASIC
 * - Intel HEX: first non-empty line starts with ':'
 * - Woz Monitor hex dump: first non-empty line matches /^[0-9A-Fa-f]{3,4}:/
 * - Otherwise: raw binary
 */
export function detectFormat(data: Uint8Array | string): ProgramFileFormat {
  // Check for binary data first
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;

  // Check for TRS-80 CMD format (starts with 0x01 or 0x02 record type)
  if (bytes.length >= 2 && (bytes[0] === 0x01 || bytes[0] === 0x02)) {
    return "trs80-cmd";
  }

  // Check for TRS-80 tokenized BAS format (D3 D3 D3 header)
  if (bytes.length >= 4 && bytes[0] === 0xd3 && bytes[1] === 0xd3 && bytes[2] === 0xd3) {
    return "trs80-bas";
  }

  const text = typeof data === "string" ? data : tryDecodeText(data);
  if (text === null) return "binary";

  const lines = text.split(/\r?\n/);

  // Check for plain text BASIC (line numbers at start)
  let basicLineCount = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;

    // Check if line starts with a number followed by BASIC keywords
    if (/^\d+\s+(PRINT|REM|GOTO|FOR|NEXT|IF|THEN|END|CLS|INPUT|LET|DIM|DATA|READ|GOSUB|RETURN|POKE|PEEK|CLEAR|NEW|RUN|LIST)/i.test(trimmed)) {
      basicLineCount++;
      if (basicLineCount >= 2) return "trs80-bas"; // Found multiple BASIC lines
    }
  }

  // Reset to check other text formats
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
 * Scan for 6502 absolute-addressed instructions that reference addresses
 * below the proposed load address. This indicates the binary was assembled
 * for a lower base address (e.g., $0280 instead of $0300).
 */
function hasReferencesBelow(data: Uint8Array, loadAddress: number): boolean {
  // Opcodes that use 3-byte absolute addressing (opcode + lo + hi)
  const absOpcodes = new Set([
    0xad, 0x8d, 0x6d, 0xed, 0x2d, 0x0d, 0x4d, 0xcd, // LDA/STA/ADC/SBC/AND/ORA/EOR/CMP abs
    0xbd, 0xb9, 0x79, 0xf9, 0xd9, 0x39, 0x19, 0x59, // abs,X / abs,Y
    0x99, 0x9d, 0xee, 0xce, 0x2c, 0x4c, 0x20,        // STA idx/INC/DEC/BIT/JMP/JSR abs
  ]);

  const scanLen = Math.min(data.length, 512);
  let count = 0;

  for (let i = 3; i < scanLen - 2; i++) {
    if (absOpcodes.has(data[i])) {
      const addr = data[i + 1] | (data[i + 2] << 8);
      if (addr >= 0x0200 && addr < loadAddress && addr < 0xd000) {
        count++;
        if (count >= 2) return true;
      }
      i += 2; // skip the address bytes
    }
  }
  return count > 0;
}

/** Find the best base address from common 6502 program bases. */
function findBestBase(data: Uint8Array, jmpTarget: number, fallback: number): number {
  const candidates = [0x0280, 0x0200, 0x0300, 0x0000, 0x0400, 0x0800, 0x1000];
  for (const base of candidates) {
    if (base !== fallback && jmpTarget >= base && jmpTarget < base + data.length) {
      return base;
    }
  }

  // Fallback: page-align the minimum viable base
  const minBase = Math.max(0, jmpTarget - data.length + 1);
  return minBase & 0xff00;
}

/**
 * Infer the correct load address for a raw binary.
 *
 * Many Apple I binaries start with `JMP $XXYY` (opcode $4C). We check two
 * conditions that indicate the requested load address is wrong:
 *
 * 1. The JMP target falls outside [loadAddress, loadAddress + length) — the
 *    jump would land in uninitialised RAM.
 * 2. The code contains absolute address references below the load address —
 *    the binary was assembled for a lower base (e.g., $0280 vs $0300).
 *
 * When either is detected we try common Apple I base addresses until one
 * makes the JMP target land inside the file.
 */
function inferLoadAddress(data: Uint8Array, requestedAddress: number): number {
  if (data.length < 3) return requestedAddress;

  // Only auto-correct when the first instruction is JMP absolute ($4C)
  if (data[0] !== 0x4c) return requestedAddress;

  const jmpTarget = data[1] | (data[2] << 8);

  // If JMP target is in ROM / I/O space it's not a relocatable reference
  if (jmpTarget >= 0xd000) return requestedAddress;

  const inRange = jmpTarget >= requestedAddress && jmpTarget < requestedAddress + data.length;

  // Case 1: JMP target outside loaded range — definitely wrong
  if (!inRange) {
    return findBestBase(data, jmpTarget, requestedAddress);
  }

  // Case 2: JMP target in range, but code references addresses below the
  // load address — the binary was assembled for a lower base.
  if (hasReferencesBelow(data, requestedAddress)) {
    return findBestBase(data, jmpTarget, requestedAddress);
  }

  return requestedAddress;
}

/**
 * Parse raw binary data.
 *
 * Wraps the bytes into a single MemoryRegion at the given load address.
 * When the binary starts with a JMP whose target is outside the requested
 * range, attempts to infer a better load address automatically.
 */
export function parseBinary(data: Uint8Array, loadAddress: number): ParsedProgram {
  const effectiveAddress = inferLoadAddress(data, loadAddress);
  const regions: MemoryRegion[] = [{ startAddress: effectiveAddress, data }];
  return {
    regions,
    entryPoint: effectiveAddress,
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
    case "trs80-cmd": {
      const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
      const result = parseTRS80CMD(bytes);
      return {
        regions: result.regions,
        entryPoint: result.entryPoint,
        format: "trs80-cmd",
        sizeBytes: computeSize(result.regions),
        addressRange: computeAddressRange(result.regions),
      };
    }
    case "trs80-bas": {
      const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
      const result = parseTRS80BAS(bytes);
      return {
        regions: result.regions,
        entryPoint: result.entryPoint,
        format: "trs80-bas",
        sizeBytes: computeSize(result.regions),
        addressRange: result.regions.length > 0 ? computeAddressRange(result.regions) : "$0000",
        textMode: result.textMode,
        listing: result.listing,
      };
    }
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

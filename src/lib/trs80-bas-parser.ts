/**
 * TRS-80 Model I Level II BASIC Tokenized File Parser (.BAS)
 *
 * Parses tokenized BASIC files in the Level II cassette format.
 * The .BAS format contains tokenized BASIC program data that can be
 * loaded directly into the TRS-80's BASIC program area in RAM.
 *
 * Format:
 *   Header:  D3 D3 D3 <filename byte>
 *   Body:    Series of tokenized BASIC lines
 *   End:     00 00 (null next-line pointer)
 *
 * Each BASIC line:
 *   - 2-byte little-endian pointer to next line address
 *   - 2-byte little-endian line number
 *   - Tokenized content bytes (0x80-0xFF = tokens, 0x20-0x7F = ASCII)
 *   - 0x00 terminator
 */

import type { MemoryRegion } from "@/emulator/apple1/software-library";

/** BASIC program start address in TRS-80 Level II RAM */
const BASIC_PROGRAM_START = 0x4a00;

/** Token lookup table for TRS-80 Level II BASIC (tokens 0x80-0xFF) */
const TOKENS: { [key: number]: string } = {
  0x80: "END",
  0x81: "FOR",
  0x82: "RESET",
  0x83: "SET",
  0x84: "CLS",
  0x85: "CMD",
  0x86: "RANDOM",
  0x87: "NEXT",
  0x88: "DATA",
  0x89: "INPUT",
  0x8a: "DIM",
  0x8b: "READ",
  0x8c: "LET",
  0x8d: "GOTO",
  0x8e: "RUN",
  0x8f: "IF",
  0x90: "RESTORE",
  0x91: "GOSUB",
  0x92: "RETURN",
  0x93: "REM",
  0x94: "STOP",
  0x95: "ELSE",
  0x96: "TRON",
  0x97: "TROFF",
  0x98: "DEFSTR",
  0x99: "DEFINT",
  0x9a: "DEFSNG",
  0x9b: "DEFDBL",
  0x9c: "LINE",
  0x9d: "EDIT",
  0x9e: "ERROR",
  0x9f: "RESUME",
  0xa0: "OUT",
  0xa1: "ON",
  0xa2: "OPEN",
  0xa3: "FIELD",
  0xa4: "GET",
  0xa5: "PUT",
  0xa6: "CLOSE",
  0xa7: "LOAD",
  0xa8: "MERGE",
  0xa9: "NAME",
  0xaa: "KILL",
  0xab: "LSET",
  0xac: "RSET",
  0xad: "SAVE",
  0xae: "SYSTEM",
  0xaf: "LPRINT",
  0xb0: "DEF",
  0xb1: "POKE",
  0xb2: "PRINT",
  0xb3: "CONT",
  0xb4: "LIST",
  0xb5: "LLIST",
  0xb6: "DELETE",
  0xb7: "AUTO",
  0xb8: "CLEAR",
  0xb9: "CLOAD",
  0xba: "CSAVE",
  0xbb: "NEW",
  0xbc: "TAB(",
  0xbd: "TO",
  0xbe: "FN",
  0xbf: "USING",
  0xc0: "VARPTR",
  0xc1: "USR",
  0xc2: "ERL",
  0xc3: "ERR",
  0xc4: "STRING$",
  0xc5: "INSTR",
  0xc6: "POINT",
  0xc7: "TIME$",
  0xc8: "MEM",
  0xc9: "INKEY$",
  0xca: "THEN",
  0xcb: "NOT",
  0xcc: "STEP",
  0xcd: "+",
  0xce: "-",
  0xcf: "*",
  0xd0: "/",
  0xd1: "^",
  0xd2: "AND",
  0xd3: "OR",
  0xd4: ">",
  0xd5: "=",
  0xd6: "<",
  0xd7: "SGN",
  0xd8: "INT",
  0xd9: "ABS",
  0xda: "FRE",
  0xdb: "INP",
  0xdc: "POS",
  0xdd: "SQR",
  0xde: "RND",
  0xdf: "LOG",
  0xe0: "EXP",
  0xe1: "COS",
  0xe2: "SIN",
  0xe3: "TAN",
  0xe4: "ATN",
  0xe5: "PEEK",
  0xe6: "CVI",
  0xe7: "CVS",
  0xe8: "CVD",
  0xe9: "EOF",
  0xea: "LOC",
  0xeb: "LOF",
  0xec: "MKI$",
  0xed: "MKS$",
  0xee: "MKD$",
  0xef: "CINT",
  0xf0: "CSNG",
  0xf1: "CDBL",
  0xf2: "FIX",
  0xf3: "LEN",
  0xf4: "STR$",
  0xf5: "VAL",
  0xf6: "ASC",
  0xf7: "CHR$",
  0xf8: "LEFT$",
  0xf9: "RIGHT$",
  0xfa: "MID$",
};

/**
 * Detokenize a TRS-80 Level II BASIC tokenized line.
 *
 * Converts token bytes (0x80-0xFF) to their keyword equivalents.
 * Preserves literal ASCII inside string literals and after REM.
 *
 * @param lineData - Tokenized content bytes (without line number/pointer)
 * @returns Detokenized BASIC code
 */
function detokenizeLine(lineData: Uint8Array): string {
  let result = "";
  let inString = false;
  let afterREM = false;

  for (let i = 0; i < lineData.length; i++) {
    const byte = lineData[i];

    // Line terminator
    if (byte === 0x00) break;

    // Toggle string literal mode on quote
    if (byte === 0x22) {
      // '"' character
      inString = !inString;
      result += '"';
      continue;
    }

    // After REM or inside string: all bytes are literal
    if (afterREM || inString) {
      result += String.fromCharCode(byte);
      continue;
    }

    // Check if this is REM token
    if (byte === 0x93) {
      result += "REM";
      afterREM = true;
      continue;
    }

    // Token (0x80-0xFF)
    if (byte >= 0x80) {
      const token = TOKENS[byte];
      if (token) {
        result += token;
      } else {
        // Unknown token — output as hex
        result += `[${byte.toString(16).toUpperCase().padStart(2, "0")}]`;
      }
      continue;
    }

    // Literal ASCII (0x20-0x7F)
    if (byte >= 0x20 && byte <= 0x7f) {
      result += String.fromCharCode(byte);
      continue;
    }

    // Control characters or other — output as hex
    result += `[${byte.toString(16).toUpperCase().padStart(2, "0")}]`;
  }

  return result;
}

/**
 * Detokenize a complete TRS-80 .BAS file into readable BASIC text.
 *
 * @param data - Complete .BAS file data (including header)
 * @returns Human-readable BASIC listing
 */
export function detokenizeTRS80BAS(data: Uint8Array): string {
  // Verify header: D3 D3 D3
  if (data.length < 4 || data[0] !== 0xd3 || data[1] !== 0xd3 || data[2] !== 0xd3) {
    throw new Error("Invalid .BAS file: missing D3 D3 D3 header");
  }

  // Skip header (D3 D3 D3 + filename byte)
  let offset = 4;
  const lines: string[] = [];

  while (offset + 4 <= data.length) {
    // Read next-line pointer (little-endian)
    const nextPtr = data[offset] | (data[offset + 1] << 8);

    // Read line number (little-endian)
    const lineNum = data[offset + 2] | (data[offset + 3] << 8);

    // End marker check: 00 00 followed by 00 00 (or end of data)
    // If both next_ptr and line_num are 0, this is the end marker
    if (nextPtr === 0x0000 && lineNum === 0x0000) break;

    // Find line terminator (0x00)
    let lineEnd = offset + 4;
    while (lineEnd < data.length && data[lineEnd] !== 0x00) {
      lineEnd++;
    }

    // Extract and detokenize line content
    const lineContent = data.slice(offset + 4, lineEnd);
    const detokenized = detokenizeLine(lineContent);

    lines.push(`${lineNum} ${detokenized}`);

    // Move to next line (skip to byte after the 0x00 terminator)
    offset = lineEnd + 1;

    // If next_ptr was 0x0000, this was the last line (even though we processed it)
    if (nextPtr === 0x0000) break;
  }

  return lines.join("\n");
}

/**
 * Check if data appears to be a plain text BASIC listing.
 * Returns true if it contains valid ASCII text with line numbers.
 */
function isPlainTextBASIC(data: Uint8Array): boolean {
  // Try to decode as UTF-8 text
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(data);
  } catch {
    return false;
  }

  // Split into lines and check first few non-empty lines
  const lines = text.split(/\r?\n/);
  let validLines = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;

    // Line should start with a number followed by a space or BASIC keyword
    // Example: "10 PRINT" or "100 REM"
    if (/^\d+\s+\w+/.test(trimmed)) {
      validLines++;
      if (validLines >= 2) return true; // Found at least 2 valid BASIC lines
    } else if (/^\d+$/.test(trimmed)) {
      // Allow lines with just numbers (empty lines in BASIC)
      validLines++;
    } else {
      // If we find a line that doesn't match, it's probably not BASIC
      // But allow a few non-matching lines (like comments at the top)
      if (validLines > 0) break;
    }

    // Only check first 10 lines
    if (validLines >= 2 || lines.indexOf(line) >= 10) break;
  }

  return validLines >= 1;
}

/**
 * Parse a TRS-80 .BAS file into memory regions for direct RAM injection,
 * or return text mode for plain text BASIC listings.
 *
 * Supports two formats:
 * 1. Tokenized .BAS files (with D3 D3 D3 header) - loaded directly into RAM
 * 2. Plain text BASIC listings - returned as text to be typed into the emulator
 *
 * @param data - Complete .BAS file data
 * @returns Parsed program with memory regions, listing, and format indicator
 */
export function parseTRS80BAS(data: Uint8Array): {
  regions: MemoryRegion[];
  entryPoint: number;
  listing: string;
  textMode: boolean;
} {
  // Check for tokenized format (D3 D3 D3 header)
  const isTokenized = data.length >= 4 &&
    data[0] === 0xd3 &&
    data[1] === 0xd3 &&
    data[2] === 0xd3;

  // Check for plain text BASIC
  const isPlainText = !isTokenized && isPlainTextBASIC(data);

  if (isPlainText) {
    // Plain text BASIC - return as text to be typed
    const listing = new TextDecoder("utf-8").decode(data).trim();
    return {
      regions: [], // No memory regions for text mode
      entryPoint: 0,
      listing,
      textMode: true,
    };
  }

  if (!isTokenized) {
    throw new Error("Invalid .BAS file: not a tokenized format (missing D3 D3 D3 header) and not a valid plain text BASIC listing");
  }

  // Tokenized format - parse as before
  // Strip header (D3 D3 D3 + filename byte) — remaining bytes are tokenized program
  const programData = data.slice(4);

  // Verify there's at least an end marker
  if (programData.length < 2) {
    throw new Error("Invalid .BAS file: program data too short");
  }

  // Create memory region at BASIC program start address
  const regions: MemoryRegion[] = [
    {
      startAddress: BASIC_PROGRAM_START,
      data: programData,
    },
  ];

  // Generate detokenized listing for display
  const listing = detokenizeTRS80BAS(data);

  return {
    regions,
    entryPoint: 0, // No specific entry point — BASIC interpreter handles execution
    listing,
    textMode: false,
  };
}

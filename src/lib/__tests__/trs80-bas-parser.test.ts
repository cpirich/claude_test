/**
 * Tests for TRS-80 .BAS (tokenized BASIC) parser
 */

import { describe, it, expect } from "vitest";
import { parseTRS80BAS, detokenizeTRS80BAS } from "../trs80-bas-parser";

/** Helper to create a .BAS file with header and program data */
function createBASFile(programBytes: number[]): Uint8Array {
  // D3 D3 D3 header + filename byte (use 'T' = 0x54)
  return new Uint8Array([0xd3, 0xd3, 0xd3, 0x54, ...programBytes]);
}

/**
 * Helper to create a tokenized BASIC line.
 *
 * @param lineNum - Line number (0-65535)
 * @param content - Tokenized content bytes
 * @param nextAddr - Next line address (use non-zero for continuation, 0x0000 for last line)
 * @returns Byte array representing the line
 */
function createLine(lineNum: number, content: number[], nextAddr: number): number[] {
  // Next-line pointer (little-endian)
  const ptrLo = nextAddr & 0xff;
  const ptrHi = (nextAddr >> 8) & 0xff;

  // Line number (little-endian)
  const numLo = lineNum & 0xff;
  const numHi = (lineNum >> 8) & 0xff;

  // Line content + terminator
  return [ptrLo, ptrHi, numLo, numHi, ...content, 0x00];
}

describe("detokenizeTRS80BAS", () => {
  it("should detokenize simple PRINT statement", () => {
    // 10 PRINT "HELLO"
    // PRINT = 0xB2, quotes = 0x22
    // Use dummy next pointer (non-zero for continuation, 0x0000 for last line)
    const line = createLine(10, [0xb2, 0x20, 0x22, 0x48, 0x45, 0x4c, 0x4c, 0x4f, 0x22], 0x0000);
    const basFile = createBASFile([...line]);

    const result = detokenizeTRS80BAS(basFile);
    expect(result).toBe('10 PRINT "HELLO"');
  });

  it("should detokenize multi-line program with various tokens", () => {
    // 10 FOR I=1 TO 10
    // FOR=0x81, TO=0xBD, =:0xD5
    // Next pointers: use dummy values (any non-zero) for continuation
    const line10 = createLine(10, [
      0x81,
      0x20,
      0x49,
      0xd5,
      0x31,
      0x20,
      0xbd,
      0x20,
      0x31,
      0x30,
    ], 0x4a10); // dummy next pointer

    // 20 PRINT I
    // PRINT=0xB2
    const line20 = createLine(20, [0xb2, 0x20, 0x49], 0x4a20); // dummy next pointer

    // 30 NEXT I
    // NEXT=0x87
    const line30 = createLine(30, [0x87, 0x20, 0x49], 0x0000); // last line

    const basFile = createBASFile([...line10, ...line20, ...line30]);

    const result = detokenizeTRS80BAS(basFile);
    const lines = result.split("\n");

    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe("10 FOR I=1 TO 10");
    expect(lines[1]).toBe("20 PRINT I");
    expect(lines[2]).toBe("30 NEXT I");
  });

  it("should preserve bytes inside string literals without detokenizing", () => {
    // 10 PRINT "TEST²"
    // String contains byte 0xB2 (PRINT token) which should NOT be detokenized
    const line = createLine(10, [
      0xb2,
      0x20,
      0x22,
      0x54,
      0x45,
      0x53,
      0x54,
      0xb2, // PRINT token inside string — should be literal
      0x22,
    ], 0x0000);
    const basFile = createBASFile([...line]);

    const result = detokenizeTRS80BAS(basFile);
    // 0xB2 inside quotes should remain as character (²)
    expect(result).toContain('PRINT "TEST');
    expect(result).toContain('"'); // Should have closing quote
  });

  it("should handle REM with arbitrary content", () => {
    // 10 REM This is a comment with tokens: PRINT FOR
    // REM=0x93, everything after is literal
    const line = createLine(10, [
      0x93,
      0x20,
      0x54,
      0x68,
      0x69,
      0x73,
      0x20,
      0x69,
      0x73,
      0x20,
      0x61,
      0x20,
      0x63,
      0x6f,
      0x6d,
      0x6d,
      0x65,
      0x6e,
      0x74,
      0x20,
      0xb2, // PRINT token — should be literal after REM
      0x81, // FOR token — should be literal after REM
    ], 0x0000);
    const basFile = createBASFile([...line]);

    const result = detokenizeTRS80BAS(basFile);
    expect(result).toContain("REM This is a comment");
    // Line should start with "10 REM" and not have PRINT/FOR as separate keywords
    expect(result).toMatch(/^10 REM/);
  });

  it("should handle empty program (header + end marker only)", () => {
    // Empty program: just 00 00 end marker
    const basFile = new Uint8Array([0xd3, 0xd3, 0xd3, 0x54, 0x00, 0x00]);

    const result = detokenizeTRS80BAS(basFile);
    expect(result).toBe("");
  });

  it("should throw error on invalid header", () => {
    const invalidFile = new Uint8Array([0x00, 0x00, 0x00, 0x00]);

    expect(() => detokenizeTRS80BAS(invalidFile)).toThrow("Invalid .BAS file: missing D3 D3 D3 header");
  });

  it("should detokenize all common tokens correctly", () => {
    // Test a line with multiple tokens
    // 10 IF X>5 THEN GOTO 100
    // IF=0x8F, >=0xD4, THEN=0xCA, GOTO=0x8D
    const line = createLine(10, [
      0x8f,
      0x20,
      0x58,
      0xd4,
      0x35,
      0x20,
      0xca,
      0x20,
      0x8d,
      0x20,
      0x31,
      0x30,
      0x30,
    ], 0x0000);
    const basFile = createBASFile([...line]);

    const result = detokenizeTRS80BAS(basFile);
    expect(result).toBe("10 IF X>5 THEN GOTO 100");
  });

  it("should handle line numbers up to 65535", () => {
    // Line 65535 (0xFFFF)
    const line = createLine(65535, [0xb2, 0x20, 0x22, 0x48, 0x49, 0x22], 0x0000); // PRINT "HI"
    const basFile = createBASFile([...line]);

    const result = detokenizeTRS80BAS(basFile);
    expect(result).toBe('65535 PRINT "HI"');
  });
});

describe("parseTRS80BAS", () => {
  it("should create memory region at $4A00 (BASIC program start)", () => {
    // 10 PRINT "TEST"
    const line = createLine(10, [0xb2, 0x20, 0x22, 0x54, 0x45, 0x53, 0x54, 0x22], 0x0000);
    const basFile = createBASFile([...line]);

    const result = parseTRS80BAS(basFile);

    expect(result.regions).toHaveLength(1);
    expect(result.regions[0].startAddress).toBe(0x4a00);
    expect(result.regions[0].data.length).toBeGreaterThan(0);
  });

  it("should return correct program data without header", () => {
    // 10 END
    const line = createLine(10, [0x80], 0x0000); // END=0x80
    const programData = [...line];
    const basFile = createBASFile(programData);

    const result = parseTRS80BAS(basFile);

    // Program data should NOT include the D3 D3 D3 header
    expect(result.regions[0].data).toEqual(new Uint8Array(programData));
  });

  it("should provide detokenized listing", () => {
    // 10 PRINT "HELLO"
    const line = createLine(10, [0xb2, 0x20, 0x22, 0x48, 0x45, 0x4c, 0x4c, 0x4f, 0x22], 0x0000);
    const basFile = createBASFile([...line]);

    const result = parseTRS80BAS(basFile);

    expect(result.listing).toBe('10 PRINT "HELLO"');
  });

  it("should set entry point to 0 (interpreter handles execution)", () => {
    const line = createLine(10, [0x80], 0x0000); // END
    const basFile = createBASFile([...line]);

    const result = parseTRS80BAS(basFile);

    expect(result.entryPoint).toBe(0);
  });

  it("should throw error on invalid header", () => {
    const invalidFile = new Uint8Array([0x00, 0x00, 0x00, 0x00]);

    expect(() => parseTRS80BAS(invalidFile)).toThrow("Invalid .BAS file");
  });

  it("should throw error on program data too short", () => {
    // Header only, no program data
    const basFile = new Uint8Array([0xd3, 0xd3, 0xd3, 0x54]);

    expect(() => parseTRS80BAS(basFile)).toThrow("Invalid .BAS file: program data too short");
  });

  it("should handle multi-line program with correct memory layout", () => {
    // Create a realistic multi-line program
    const line10 = createLine(10, [0x81, 0x20, 0x49, 0xd5, 0x31, 0x20, 0xbd, 0x20, 0x35], 0x4a10); // FOR I=1 TO 5
    const line20 = createLine(20, [0xb2, 0x20, 0x49], 0x4a20); // PRINT I
    const line30 = createLine(30, [0x87, 0x20, 0x49], 0x0000); // NEXT I
    const basFile = createBASFile([...line10, ...line20, ...line30]);

    const result = parseTRS80BAS(basFile);

    // Should have one region at $4A00
    expect(result.regions).toHaveLength(1);
    expect(result.regions[0].startAddress).toBe(0x4a00);

    // Listing should have 3 lines
    const lines = result.listing.split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain("FOR");
    expect(lines[1]).toContain("PRINT");
    expect(lines[2]).toContain("NEXT");
  });

  it("should return textMode=false for tokenized files", () => {
    const line = createLine(10, [0x80], 0x0000); // END
    const basFile = createBASFile([...line]);

    const result = parseTRS80BAS(basFile);

    expect(result.textMode).toBe(false);
  });
});

describe("parseTRS80BAS - Plain Text Format", () => {
  it("should detect and parse plain text BASIC listing", () => {
    const plainText = `10 PRINT "HELLO WORLD"
20 GOTO 10`;
    const data = new TextEncoder().encode(plainText);

    const result = parseTRS80BAS(data);

    expect(result.textMode).toBe(true);
    expect(result.regions).toHaveLength(0);
    expect(result.listing).toBe(plainText);
    expect(result.entryPoint).toBe(0);
  });

  it("should handle plain text with various BASIC keywords", () => {
    const plainText = `1 CLEAR100:ONERRORGOTO2:POKE16553,255:GOTO100
2 CLS:PRINT"PROBABLE BAD LOAD! RELOAD TAPE!":END
100 REM VERSION 09/14/78
10 PRINT "HELLO WORLD"
20 GOTO 10`;
    const data = new TextEncoder().encode(plainText);

    const result = parseTRS80BAS(data);

    expect(result.textMode).toBe(true);
    expect(result.listing).toContain("CLEAR100");
    expect(result.listing).toContain("PRINT");
    expect(result.listing).toContain("GOTO");
  });

  it("should handle plain text with blank lines", () => {
    const plainText = `10 PRINT "TEST"

20 GOTO 10

30 END`;
    const data = new TextEncoder().encode(plainText);

    const result = parseTRS80BAS(data);

    expect(result.textMode).toBe(true);
    expect(result.listing).toContain("10 PRINT");
    expect(result.listing).toContain("20 GOTO");
    expect(result.listing).toContain("30 END");
  });

  it("should handle plain text with Windows line endings", () => {
    const plainText = "10 PRINT \"HELLO\"\r\n20 GOTO 10\r\n";
    const data = new TextEncoder().encode(plainText);

    const result = parseTRS80BAS(data);

    expect(result.textMode).toBe(true);
    expect(result.listing).toContain("10 PRINT");
    expect(result.listing).toContain("20 GOTO");
  });

  it("should handle plain text with only single valid line", () => {
    const plainText = "10 PRINT \"HELLO\"";
    const data = new TextEncoder().encode(plainText);

    const result = parseTRS80BAS(data);

    expect(result.textMode).toBe(true);
    expect(result.listing).toBe(plainText);
  });

  it("should handle plain text with comments and empty lines", () => {
    const plainText = `10 REM This is a test program
20 PRINT "HELLO"
30 REM Another comment
40 END`;
    const data = new TextEncoder().encode(plainText);

    const result = parseTRS80BAS(data);

    expect(result.textMode).toBe(true);
    expect(result.listing).toContain("REM This is a test");
    expect(result.listing).toContain("PRINT \"HELLO\"");
  });

  it("should throw error for invalid format (neither tokenized nor plain text)", () => {
    // Random binary data that doesn't match either format
    const invalidData = new Uint8Array([0x01, 0x02, 0x03, 0x04, 0xff, 0xfe]);

    expect(() => parseTRS80BAS(invalidData)).toThrow("Invalid .BAS file");
  });

  it("should prefer tokenized format when D3 D3 D3 header is present", () => {
    // Even if the content after the header looks like text, it should be treated as tokenized
    const line = createLine(10, [0x80], 0x0000); // END
    const basFile = createBASFile([...line]);

    const result = parseTRS80BAS(basFile);

    expect(result.textMode).toBe(false);
    expect(result.regions).toHaveLength(1);
  });

  it("should detect single-line plain text BASIC program", () => {
    const plainText = "10 PRINT \"HELLO WORLD\"";
    const data = new TextEncoder().encode(plainText);

    const result = parseTRS80BAS(data);

    expect(result.textMode).toBe(true);
    expect(result.listing).toBe(plainText);
    expect(result.regions).toHaveLength(0);
    expect(result.entryPoint).toBe(0);
  });

  it("should recognize programs with extended keywords ONERROR, STOP, RESTORE, ON", () => {
    const plainText = `1 CLEAR100:ONERROR GOTO 2:POKE16553,255
2 CLS:PRINT"ERROR":STOP
3 RESTORE:ON X GOTO 10,20,30`;
    const data = new TextEncoder().encode(plainText);

    const result = parseTRS80BAS(data);

    expect(result.textMode).toBe(true);
    expect(result.listing).toContain("ONERROR");
    expect(result.listing).toContain("STOP");
    expect(result.listing).toContain("RESTORE");
    expect(result.listing).toContain("ON");
  });
});

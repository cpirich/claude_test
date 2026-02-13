import { describe, it, expect } from "vitest";
import {
  detectFormat,
  parseIntelHex,
  parseWozHexDump,
  parseBinary,
  parseProgram,
} from "../program-parser";

describe("detectFormat", () => {
  it("detects Intel HEX format", () => {
    expect(detectFormat(":10010000214601360121470136007EFE09D2190140")).toBe("intel-hex");
  });

  it("detects Woz Monitor hex dump format", () => {
    expect(detectFormat("0300: A9 00 85 10\n0304: A2 20 86 11")).toBe("woz-hex-dump");
  });

  it("detects 3-digit addresses in Woz format", () => {
    expect(detectFormat("300: A9 00")).toBe("woz-hex-dump");
  });

  it("detects binary from Uint8Array with non-printable bytes", () => {
    const data = new Uint8Array([0xa9, 0x00, 0x85, 0x10, 0x00, 0xff, 0x01, 0x02]);
    expect(detectFormat(data)).toBe("binary");
  });

  it("skips blank lines when detecting format", () => {
    expect(detectFormat("\n\n:10010000214601360121470136007EFE09D2190140")).toBe("intel-hex");
  });

  it("detects TRS-80 tokenized BAS format (D3 D3 D3 header)", () => {
    const data = new Uint8Array([0xd3, 0xd3, 0xd3, 0x54, 0x00, 0x00]);
    expect(detectFormat(data)).toBe("trs80-bas");
  });

  it("detects plain text BASIC listing with line numbers and PRINT", () => {
    const plainText = "10 PRINT \"HELLO\"\n20 GOTO 10";
    expect(detectFormat(plainText)).toBe("trs80-bas");
  });

  it("detects plain text BASIC with various keywords", () => {
    const plainText = "10 FOR I=1 TO 10\n20 NEXT I";
    expect(detectFormat(plainText)).toBe("trs80-bas");
  });

  it("detects plain text BASIC with REM statements", () => {
    const plainText = "10 REM This is a comment\n20 END";
    expect(detectFormat(plainText)).toBe("trs80-bas");
  });

  it("detects plain text BASIC with INPUT statement", () => {
    const plainText = "10 INPUT A\n20 PRINT A";
    expect(detectFormat(plainText)).toBe("trs80-bas");
  });

  it("detects plain text BASIC even with a single line", () => {
    const singleLine = "10 PRINT \"HELLO\"";
    // Single line with valid BASIC keyword should be detected
    expect(detectFormat(singleLine)).toBe("trs80-bas");
  });

  it("does not detect as BASIC if line lacks keywords", () => {
    const notBasic = "10 some random text\n20 more random text";
    expect(detectFormat(notBasic)).toBe("binary");
  });

  it("detects TRS-80 CMD format (type 01 data block header)", () => {
    // Minimal valid CMD file: type 01, length 04, addr 4000, 2 bytes data
    const data = new Uint8Array([0x01, 0x04, 0x00, 0x40, 0xc3, 0xc9]);
    expect(detectFormat(data)).toBe("trs80-cmd");
  });

  it("detects TRS-80 CMD format (type 02 entry point header)", () => {
    const data = new Uint8Array([0x02, 0x02, 0x00, 0x40]);
    expect(detectFormat(data)).toBe("trs80-cmd");
  });
});

describe("parseIntelHex", () => {
  it("parses a single data record", () => {
    // 4 bytes at address $0100: 01 02 03 04
    const hex = ":0401000001020304F1\n:00000001FF\n";
    const result = parseIntelHex(hex);

    expect(result.format).toBe("intel-hex");
    expect(result.regions.length).toBe(1);
    expect(result.regions[0].startAddress).toBe(0x0100);
    expect(Array.from(result.regions[0].data)).toEqual([0x01, 0x02, 0x03, 0x04]);
    expect(result.sizeBytes).toBe(4);
    expect(result.entryPoint).toBe(0x0100);
  });

  it("parses multiple contiguous records into one region", () => {
    const hex = [
      ":020000000102FB",  // 2 bytes at $0000
      ":020002000304F5",  // 2 bytes at $0002 (contiguous)
      ":00000001FF",
    ].join("\n");
    const result = parseIntelHex(hex);

    expect(result.regions.length).toBe(1);
    expect(result.regions[0].startAddress).toBe(0x0000);
    expect(Array.from(result.regions[0].data)).toEqual([0x01, 0x02, 0x03, 0x04]);
  });

  it("creates separate regions for non-contiguous data", () => {
    const hex = [
      ":020000000102FB",  // 2 bytes at $0000
      ":020100000304F6",  // 2 bytes at $0100 (gap)
      ":00000001FF",
    ].join("\n");
    const result = parseIntelHex(hex);

    expect(result.regions.length).toBe(2);
    expect(result.regions[0].startAddress).toBe(0x0000);
    expect(result.regions[1].startAddress).toBe(0x0100);
  });

  it("throws on checksum error", () => {
    expect(() => parseIntelHex(":040100000102030400\n")).toThrow(/checksum/i);
  });

  it("throws on missing colon prefix", () => {
    expect(() => parseIntelHex("0401000001020304F1\n")).toThrow(/expected ':'/i);
  });

  it("handles empty input", () => {
    const result = parseIntelHex(":00000001FF\n");
    expect(result.regions.length).toBe(0);
    expect(result.sizeBytes).toBe(0);
  });
});

describe("parseWozHexDump", () => {
  it("parses a single line", () => {
    const result = parseWozHexDump("0300: A9 00 85 10");

    expect(result.format).toBe("woz-hex-dump");
    expect(result.regions.length).toBe(1);
    expect(result.regions[0].startAddress).toBe(0x0300);
    expect(Array.from(result.regions[0].data)).toEqual([0xa9, 0x00, 0x85, 0x10]);
    expect(result.entryPoint).toBe(0x0300);
  });

  it("parses multiple contiguous lines into one region", () => {
    const result = parseWozHexDump("0300: A9 00\n0302: 85 10");

    expect(result.regions.length).toBe(1);
    expect(result.regions[0].startAddress).toBe(0x0300);
    expect(Array.from(result.regions[0].data)).toEqual([0xa9, 0x00, 0x85, 0x10]);
  });

  it("creates separate regions for non-contiguous data", () => {
    const result = parseWozHexDump("0300: A9 00\n0400: 85 10");

    expect(result.regions.length).toBe(2);
    expect(result.regions[0].startAddress).toBe(0x0300);
    expect(result.regions[1].startAddress).toBe(0x0400);
  });

  it("skips comment lines", () => {
    const input = "# This is a comment\n// Another comment\n0300: A9 00";
    const result = parseWozHexDump(input);

    expect(result.regions.length).toBe(1);
    expect(result.regions[0].startAddress).toBe(0x0300);
  });

  it("skips blank lines", () => {
    const result = parseWozHexDump("\n0300: A9 00\n\n0302: 85 10\n");

    expect(result.regions.length).toBe(1);
    expect(result.sizeBytes).toBe(4);
  });

  it("handles 3-digit addresses", () => {
    const result = parseWozHexDump("300: A9 00");
    expect(result.regions[0].startAddress).toBe(0x300);
  });

  it("throws on invalid hex byte", () => {
    expect(() => parseWozHexDump("0300: ZZ")).toThrow(/invalid byte/i);
  });

  it("handles empty input", () => {
    const result = parseWozHexDump("");
    expect(result.regions.length).toBe(0);
    expect(result.sizeBytes).toBe(0);
  });
});

describe("parseBinary", () => {
  it("creates a single region at the given address", () => {
    const data = new Uint8Array([0xa9, 0x00, 0x85, 0x10]);
    const result = parseBinary(data, 0x0300);

    expect(result.format).toBe("binary");
    expect(result.regions.length).toBe(1);
    expect(result.regions[0].startAddress).toBe(0x0300);
    expect(result.regions[0].data).toBe(data);
    expect(result.entryPoint).toBe(0x0300);
    expect(result.sizeBytes).toBe(4);
    expect(result.addressRange).toBe("$0300-$0303");
  });

  it("handles single byte", () => {
    const result = parseBinary(new Uint8Array([0xff]), 0xe000);
    expect(result.addressRange).toBe("$E000");
    expect(result.sizeBytes).toBe(1);
  });

  it("does not adjust when first byte is not JMP", () => {
    const data = new Uint8Array(16);
    data[0] = 0xa9; data[1] = 0x00; // LDA #$00
    expect(parseBinary(data, 0x0300).regions[0].startAddress).toBe(0x0300);
  });

  it("does not adjust when JMP targets ROM/IO space", () => {
    const data = new Uint8Array(16);
    data[0] = 0x4c; data[1] = 0xef; data[2] = 0xff; // JMP $FFEF
    expect(parseBinary(data, 0x0300).regions[0].startAddress).toBe(0x0300);
  });

  it("does not adjust when JMP target is in range and no below references", () => {
    // JMP $0500 at $0300, 1024 bytes — target in range, no below refs
    const data = new Uint8Array(1024);
    data[0] = 0x4c; data[1] = 0x00; data[2] = 0x05;
    expect(parseBinary(data, 0x0300).regions[0].startAddress).toBe(0x0300);
  });

  it("adjusts load address when JMP target is outside loaded range", () => {
    // JMP $0900, 512 bytes at $0300: range $0300-$04FF, target outside
    // Best candidate: $0800 ($0800+512=$0A00 > $0900)
    const data = new Uint8Array(512);
    data[0] = 0x4c; data[1] = 0x00; data[2] = 0x09;
    expect(parseBinary(data, 0x0300).regions[0].startAddress).toBe(0x0800);
  });

  it("uses page-aligned fallback when no common base fits", () => {
    // JMP $3000, 257 bytes at $0300: no common base includes $3000
    // minBase = $3000 - 257 + 1 = $2F00, page-aligned $2F00
    const data = new Uint8Array(257);
    data[0] = 0x4c; data[1] = 0x00; data[2] = 0x30;
    expect(parseBinary(data, 0x0300).regions[0].startAddress).toBe(0x2f00);
  });

  it("infers $0280 when code has absolute references below load address", () => {
    // Simulates 2048.bin: JMP $0A12 (in range at $0300, since 1962+$0300=$0ACA)
    // but code references $0283 (below $0300) via ADC $0283,Y
    const data = new Uint8Array(1962);
    data[0] = 0x4c; data[1] = 0x12; data[2] = 0x0a; // JMP $0A12

    // Place ADC $0283,Y (opcode $79) at two code offsets
    data[0x138] = 0x79; data[0x139] = 0x83; data[0x13a] = 0x02;
    data[0x140] = 0x79; data[0x141] = 0x83; data[0x142] = 0x02;

    const result = parseBinary(data, 0x0300);
    // $0283 < $0300 triggers below-reference detection
    // findBestBase tries $0280: $0280+1962=$0A2A > $0A12 ✓
    expect(result.regions[0].startAddress).toBe(0x0280);
    expect(result.entryPoint).toBe(0x0280);
  });

  it("keeps requested address when JMP in range and no below references", () => {
    // JMP $0400, 1024 bytes, only references addresses >= $0300
    const data = new Uint8Array(1024);
    data[0] = 0x4c; data[1] = 0x00; data[2] = 0x04;
    // STA $0350 (above $0300, not a below reference)
    data[0x10] = 0x8d; data[0x11] = 0x50; data[0x12] = 0x03;
    expect(parseBinary(data, 0x0300).regions[0].startAddress).toBe(0x0300);
  });

  it("does not trigger on references below $0200 (zero page / stack)", () => {
    // JMP $0400, 1024 bytes, references $0100 (stack area — ignore)
    const data = new Uint8Array(1024);
    data[0] = 0x4c; data[1] = 0x00; data[2] = 0x04;
    data[0x10] = 0xad; data[0x11] = 0x00; data[0x12] = 0x01; // LDA $0100
    expect(parseBinary(data, 0x0300).regions[0].startAddress).toBe(0x0300);
  });
});

describe("parseProgram", () => {
  it("auto-detects and parses Intel HEX", () => {
    const hex = ":0401000001020304F1\n:00000001FF\n";
    const result = parseProgram(hex);
    expect(result.format).toBe("intel-hex");
    expect(result.regions.length).toBe(1);
  });

  it("auto-detects and parses Woz hex dump", () => {
    const result = parseProgram("0300: A9 00 85 10");
    expect(result.format).toBe("woz-hex-dump");
    expect(result.regions.length).toBe(1);
  });

  it("auto-detects binary from Uint8Array", () => {
    const data = new Uint8Array([0xa9, 0x00, 0x85, 0x10, 0x00, 0xff]);
    const result = parseProgram(data, { loadAddress: 0xe000 });
    expect(result.format).toBe("binary");
    expect(result.regions[0].startAddress).toBe(0xe000);
  });

  it("uses default load address $0300 for binary", () => {
    const data = new Uint8Array([0xa9, 0x00]);
    const result = parseProgram(data);
    expect(result.regions[0].startAddress).toBe(0x0300);
  });

  it("respects explicit format override", () => {
    // This looks like it could be text, but force binary
    const data = new Uint8Array([0x30, 0x33, 0x30, 0x30]); // "0300" as ASCII
    const result = parseProgram(data, { format: "binary", loadAddress: 0x0400 });
    expect(result.format).toBe("binary");
    expect(result.regions[0].startAddress).toBe(0x0400);
  });

  it("auto-detects and parses tokenized TRS-80 BAS", () => {
    // Create a minimal tokenized BAS file
    const basFile = new Uint8Array([
      0xd3, 0xd3, 0xd3, 0x54,  // Header
      0x00, 0x00,              // End marker (simple case)
    ]);
    const result = parseProgram(basFile);
    expect(result.format).toBe("trs80-bas");
    expect(result.textMode).toBe(false);
  });

  it("auto-detects and parses plain text TRS-80 BAS", () => {
    const plainText = "10 PRINT \"HELLO\"\n20 GOTO 10";
    const result = parseProgram(plainText);
    expect(result.format).toBe("trs80-bas");
    expect(result.textMode).toBe(true);
    expect(result.listing).toBe(plainText);
    expect(result.regions.length).toBe(0);
  });

  it("returns listing for tokenized TRS-80 BAS", () => {
    // Create a tokenized BASIC program: 10 END
    const basFile = new Uint8Array([
      0xd3, 0xd3, 0xd3, 0x54,  // Header
      0x00, 0x00,              // Next line pointer (end)
      0x0a, 0x00,              // Line number 10
      0x80,                    // Token for END
      0x00,                    // Line terminator
      0x00, 0x00,              // Program end marker
    ]);
    const result = parseProgram(basFile);
    expect(result.format).toBe("trs80-bas");
    expect(result.listing).toBe("10 END");
  });

  it("can force TRS-80 BAS format", () => {
    const plainText = "10 PRINT \"TEST\"";
    const result = parseProgram(plainText, { format: "trs80-bas" });
    expect(result.format).toBe("trs80-bas");
    expect(result.textMode).toBe(true);
  });

  it("auto-detects and parses TRS-80 CMD format", () => {
    // Minimal CMD file: type 01, length 04, addr 4000, 2 data bytes
    const cmdFile = new Uint8Array([0x01, 0x04, 0x00, 0x40, 0xc3, 0xc9]);
    const result = parseProgram(cmdFile);
    expect(result.format).toBe("trs80-cmd");
    expect(result.regions.length).toBe(1);
    expect(result.regions[0].startAddress).toBe(0x4000);
    expect(Array.from(result.regions[0].data)).toEqual([0xc3, 0xc9]);
    expect(result.entryPoint).toBe(0x4000);
  });

  it("dispatches to trs80-cmd parser when format is specified", () => {
    const cmdFile = new Uint8Array([0x01, 0x04, 0x00, 0x40, 0xc3, 0xc9]);
    const result = parseProgram(cmdFile, { format: "trs80-cmd" });
    expect(result.format).toBe("trs80-cmd");
    expect(result.regions.length).toBe(1);
  });

  it("detects single-line plain text BASIC file", () => {
    const singleLine = "10 PRINT \"HELLO\"";
    const result = detectFormat(singleLine);
    expect(result).toBe("trs80-bas");
  });

  it("detects programs using extended keywords CLEAR, POKE, ONERROR", () => {
    const program = "1 CLEAR100:ONERROR GOTO 2:POKE16553,255";
    const result = detectFormat(program);
    expect(result).toBe("trs80-bas");
  });

  it("parses multi-line plain text BAS file correctly through parseProgram with textMode=true", () => {
    const plainText = `10 PRINT "HELLO WORLD"
20 FOR I=1 TO 10
30 PRINT I
40 NEXT I
50 END`;
    const result = parseProgram(plainText);

    expect(result.format).toBe("trs80-bas");
    expect(result.textMode).toBe(true);
    expect(result.listing).toBe(plainText);
    expect(result.regions.length).toBe(0);
    expect(result.entryPoint).toBe(0);
  });
});

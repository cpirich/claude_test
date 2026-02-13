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
});

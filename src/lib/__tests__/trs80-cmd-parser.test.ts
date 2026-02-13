/**
 * Tests for TRS-80 .CMD File Parser
 */

import { describe, expect, test } from "vitest";
import { parseTRS80CMD } from "../trs80-cmd-parser";

describe("parseTRS80CMD", () => {
  test("parses valid .CMD with single data block and entry point", () => {
    // Type 01: Load 3 bytes at address $5000
    // Type 02: Entry point at $5000
    const cmd = new Uint8Array([
      0x01, 0x05,       // Type 01, length 5 (2 addr + 3 data)
      0x00, 0x50,       // Load address $5000 (little-endian)
      0xc3, 0x10, 0x50, // Data: JP $5010 in Z80
      0x02, 0x02,       // Type 02, length 2
      0x00, 0x50,       // Entry point $5000 (little-endian)
    ]);

    const result = parseTRS80CMD(cmd);

    expect(result.regions).toHaveLength(1);
    expect(result.regions[0].startAddress).toBe(0x5000);
    expect(result.regions[0].data).toEqual(new Uint8Array([0xc3, 0x10, 0x50]));
    expect(result.entryPoint).toBe(0x5000);
  });

  test("parses multiple non-contiguous data blocks", () => {
    // Load block at $4000 and another at $6000
    const cmd = new Uint8Array([
      0x01, 0x04,       // Type 01, length 4 (2 addr + 2 data)
      0x00, 0x40,       // Load address $4000
      0x21, 0x00,       // Data
      0x01, 0x03,       // Type 01, length 3 (2 addr + 1 data)
      0x00, 0x60,       // Load address $6000
      0x76,             // Data (HALT)
      0x02, 0x02,       // Type 02, length 2
      0x00, 0x40,       // Entry point $4000
    ]);

    const result = parseTRS80CMD(cmd);

    expect(result.regions).toHaveLength(2);
    expect(result.regions[0].startAddress).toBe(0x4000);
    expect(result.regions[0].data).toEqual(new Uint8Array([0x21, 0x00]));
    expect(result.regions[1].startAddress).toBe(0x6000);
    expect(result.regions[1].data).toEqual(new Uint8Array([0x76]));
    expect(result.entryPoint).toBe(0x4000);
  });

  test("handles length byte of 0 (meaning 256 bytes)", () => {
    // Create a 256-byte data block
    const dataBytes = new Uint8Array(254); // 256 - 2 (for address) = 254
    for (let i = 0; i < 254; i++) {
      dataBytes[i] = i & 0xff;
    }

    const cmd = new Uint8Array([
      0x01, 0x00,       // Type 01, length 0 (means 256)
      0x00, 0x30,       // Load address $3000
      ...dataBytes,     // 254 bytes of data
      0x02, 0x02,       // Type 02, length 2
      0x00, 0x30,       // Entry point $3000
    ]);

    const result = parseTRS80CMD(cmd);

    expect(result.regions).toHaveLength(1);
    expect(result.regions[0].startAddress).toBe(0x3000);
    expect(result.regions[0].data).toHaveLength(254);
    expect(result.regions[0].data).toEqual(dataBytes);
    expect(result.entryPoint).toBe(0x3000);
  });

  test("defaults to first block address when entry point is missing", () => {
    // Only a data block, no entry point record
    const cmd = new Uint8Array([
      0x01, 0x05,       // Type 01, length 5
      0x34, 0x12,       // Load address $1234 (little-endian)
      0x00, 0x00, 0x00, // Data
    ]);

    const result = parseTRS80CMD(cmd);

    expect(result.regions).toHaveLength(1);
    expect(result.regions[0].startAddress).toBe(0x1234);
    expect(result.entryPoint).toBe(0x1234); // Defaults to first block
  });

  test("throws error on empty file", () => {
    const cmd = new Uint8Array([]);

    expect(() => parseTRS80CMD(cmd)).toThrow(".CMD parse error: empty file");
  });

  test("throws error on truncated record header", () => {
    // Only 1 byte (need at least 2)
    const cmd = new Uint8Array([0x01]);

    expect(() => parseTRS80CMD(cmd)).toThrow("truncated record header");
  });

  test("throws error on truncated data block", () => {
    // Says it has 5 bytes but only provides 3
    const cmd = new Uint8Array([
      0x01, 0x05,       // Type 01, length 5
      0x00, 0x10,       // Load address
      0x00,             // Only 1 data byte (need 3 = 5 - 2)
    ]);

    expect(() => parseTRS80CMD(cmd)).toThrow("truncated data block");
  });

  test("throws error on truncated entry point record", () => {
    const cmd = new Uint8Array([
      0x01, 0x03,       // Type 01, length 3
      0x00, 0x10,       // Load address
      0x00,             // 1 data byte
      0x02, 0x02,       // Type 02, length 2
      0x00,             // Only 1 byte of address (need 2)
    ]);

    expect(() => parseTRS80CMD(cmd)).toThrow("truncated entry point record");
  });

  test("throws error on invalid entry point length", () => {
    const cmd = new Uint8Array([
      0x01, 0x03,       // Type 01, length 3
      0x00, 0x10,       // Load address
      0x00,             // 1 data byte
      0x02, 0x03,       // Type 02, but length is 03 (should be 02)
      0x00, 0x10, 0x00, // 3 bytes
    ]);

    expect(() => parseTRS80CMD(cmd)).toThrow("entry point record must have length 02");
  });

  test("throws error on unknown record type", () => {
    const cmd = new Uint8Array([
      0x03, 0x02,       // Unknown type 03
      0x00, 0x00,
    ]);

    expect(() => parseTRS80CMD(cmd)).toThrow("unknown record type 03");
  });

  test("throws error on data block with length less than 2", () => {
    const cmd = new Uint8Array([
      0x01, 0x01,       // Type 01, length 1 (invalid, need at least 2 for address)
      0x00,             // Only 1 byte
    ]);

    expect(() => parseTRS80CMD(cmd)).toThrow("data block length must be at least 2");
  });

  test("throws error when no data blocks found", () => {
    // Just an entry point, no data blocks
    const cmd = new Uint8Array([
      0x02, 0x02,       // Type 02
      0x00, 0x10,       // Entry point
    ]);

    expect(() => parseTRS80CMD(cmd)).toThrow("no data blocks found");
  });

  test("handles little-endian address correctly", () => {
    // Verify little-endian interpretation: $ABCD stored as CD AB
    const cmd = new Uint8Array([
      0x01, 0x03,       // Type 01, length 3
      0xcd, 0xab,       // Load address $ABCD (little-endian)
      0xff,             // 1 data byte
      0x02, 0x02,       // Type 02
      0x34, 0x12,       // Entry point $1234 (little-endian)
    ]);

    const result = parseTRS80CMD(cmd);

    expect(result.regions[0].startAddress).toBe(0xabcd);
    expect(result.entryPoint).toBe(0x1234);
  });
});

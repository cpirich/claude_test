/**
 * TRS-80 .CMD File Parser
 *
 * Parses TRS-80 machine language executable files (.CMD format).
 * The .CMD format is a record-based binary format with data blocks and entry points.
 */

import type { MemoryRegion } from "@/emulator/apple1/software-library";

export interface CMDParseResult {
  regions: MemoryRegion[];
  entryPoint: number;
}

/**
 * Parse a TRS-80 .CMD file.
 *
 * @param data - The binary content of the .CMD file
 * @returns Parsed memory regions and entry point
 * @throws Error if the file is malformed
 */
export function parseTRS80CMD(data: Uint8Array): CMDParseResult {
  if (data.length === 0) {
    throw new Error(".CMD parse error: empty file");
  }

  const regions: MemoryRegion[] = [];
  let entryPoint: number | undefined;
  let offset = 0;

  while (offset < data.length) {
    // Need at least 2 bytes for record type and length
    if (offset + 1 >= data.length) {
      throw new Error(`.CMD parse error at offset ${offset}: truncated record header`);
    }

    const recordType = data[offset];
    const length = data[offset + 1];
    offset += 2;

    // Convert length: 0 means 256 bytes
    const effectiveLength = length === 0 ? 256 : length;

    if (recordType === 0x01) {
      // Type 01: Data block
      // Format: 01 LL AAAA DD DD DD ...
      // LL includes the 2 address bytes, so data length is LL - 2

      if (effectiveLength < 2) {
        throw new Error(`.CMD parse error at offset ${offset - 2}: data block length must be at least 2 (got ${length})`);
      }

      if (offset + effectiveLength > data.length) {
        throw new Error(`.CMD parse error at offset ${offset - 2}: truncated data block (need ${effectiveLength} bytes, have ${data.length - offset})`);
      }

      // Read little-endian load address
      const addrLo = data[offset];
      const addrHi = data[offset + 1];
      const loadAddress = addrLo | (addrHi << 8);
      offset += 2;

      // Read data bytes (effectiveLength - 2)
      const dataLength = effectiveLength - 2;
      const blockData = data.slice(offset, offset + dataLength);
      offset += dataLength;

      regions.push({
        startAddress: loadAddress,
        data: blockData,
      });
    } else if (recordType === 0x02) {
      // Type 02: Transfer/Entry point
      // Format: 02 02 AAAA

      if (length !== 0x02) {
        throw new Error(`.CMD parse error at offset ${offset - 2}: entry point record must have length 02 (got ${length.toString(16).padStart(2, "0")})`);
      }

      if (offset + 2 > data.length) {
        throw new Error(`.CMD parse error at offset ${offset - 2}: truncated entry point record`);
      }

      // Read little-endian entry address
      const addrLo = data[offset];
      const addrHi = data[offset + 1];
      entryPoint = addrLo | (addrHi << 8);
      offset += 2;

      // Entry point record typically marks the end of the file
      break;
    } else {
      throw new Error(`.CMD parse error at offset ${offset - 2}: unknown record type ${recordType.toString(16).padStart(2, "0")}`);
    }
  }

  // Validate that we have at least one data block
  if (regions.length === 0) {
    throw new Error(".CMD parse error: no data blocks found");
  }

  // If no entry point was specified, default to the first data block's address
  if (entryPoint === undefined) {
    entryPoint = regions[0].startAddress;
  }

  return {
    regions,
    entryPoint,
  };
}

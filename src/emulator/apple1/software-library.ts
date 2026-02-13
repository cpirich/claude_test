/**
 * Software Library — Type Definitions
 *
 * Shared types for the built-in software catalog, remote loading, and file import.
 */

export type SoftwareCategory =
  | "language"
  | "diagnostic"
  | "utility"
  | "demo"
  | "game";

/** Supported file formats for external program loading. */
export type ProgramFileFormat = "binary" | "intel-hex" | "woz-hex-dump" | "trs80-bas" | "trs80-cmd";

/** Target machine type. */
export type MachineType = "apple1" | "trs80";

/** A contiguous block of bytes to load at a specific address. */
export interface MemoryRegion {
  /** Start address in the machine's address space (e.g., 0xE000). */
  startAddress: number;
  /** Raw bytes to load. */
  data: Uint8Array;
}

/** A single entry in the software catalog. */
export interface SoftwareEntry {
  /** Unique identifier (slug). */
  id: string;
  /** Display name. */
  name: string;
  /** Short description (1-2 sentences). */
  description: string;
  /** Category for filtering/grouping. */
  category: SoftwareCategory;
  /** Memory regions to load. Empty for remote entries until fetched. */
  regions: MemoryRegion[];
  /** Entry point address (where to set PC after loading). */
  entryPoint: number;
  /** Original author or source attribution. */
  author: string;
  /** Year of creation (if known). */
  year?: number;
  /** Total size in bytes across all regions. */
  sizeBytes: number;
  /** Address range summary for display (e.g., "$E000-$EFFF"). */
  addressRange: string;
  /** True if binary data is a placeholder (not the real program). */
  isStub: boolean;
  /** Optional notes about the program. */
  notes?: string;
  /** Instructions shown after loading (e.g., "Type E000R to run"). */
  loadInstructions?: string;
  /** URL to fetch the program binary from (via proxy). */
  url?: string;
  /** Expected file format at the URL. Omit for auto-detect. */
  format?: ProgramFileFormat;
  /** Default load address for raw binary files without embedded addresses. */
  defaultLoadAddress?: number;
  /** Which machine this entry targets. Defaults to "apple1". */
  machine?: MachineType;
  /** True if this is a text program that should be typed into the emulator. */
  textMode?: boolean;
  /** For text mode programs, the full text content to type. */
  listing?: string;
}

/** Result from parsing a program file. */
export interface ParsedProgram {
  regions: MemoryRegion[];
  entryPoint?: number;
  format: ProgramFileFormat;
  sizeBytes: number;
  addressRange: string;
  /** True if this is a text program that should be typed into the emulator rather than loaded into memory. */
  textMode?: boolean;
  /** For text mode programs, the full text content to type. */
  listing?: string;
}

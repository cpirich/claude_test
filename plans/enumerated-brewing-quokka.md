# Software Library — Remote Loading & File Import

## Context

The software library currently only has hardcoded built-in programs. Users need to load popular software from the internet (e.g., apple1software.com, GitHub ROM repos) and from local files. This plan adds three loading mechanisms: a curated remote catalog, a paste-any-URL input, and file upload/drag-drop — supporting binary, Intel HEX, and Woz Monitor hex dump formats.

## Architecture

All three loading methods converge on the same output: a `SoftwareEntry` with populated `regions[]`, passed to the existing `onLoad(entry)` callback.

```
  BROWSE tab          URL tab           FILE tab
  (catalog)        (paste URL)      (upload/drag-drop)
      |                |                   |
      | url? fetch     | fetch via         | FileReader
      | via proxy      | proxy             | (local)
      v                v                   v
  +---------------------------------------------------+
  |         Format Detection & Parsing                 |
  |  parseIntelHex | parseWozHexDump | parseBinary     |
  +---------------------------------------------------+
                       |
                       v
              MemoryRegion[] + entryPoint
                       |
                       v
               onLoad(SoftwareEntry)
```

## Step 1: Extend type definitions

**Modify** `src/emulator/apple1/software-library.ts` — add new fields:

```ts
export type ProgramFileFormat = "binary" | "intel-hex" | "woz-hex-dump";
export type MachineType = "apple1" | "trs80";

// Add to SoftwareEntry:
  url?: string;                  // Remote fetch URL (via proxy)
  format?: ProgramFileFormat;    // Expected format (omit for auto-detect)
  defaultLoadAddress?: number;   // For binary format without embedded addresses
  machine?: MachineType;         // Defaults to "apple1"

// New type:
export interface ParsedProgram {
  regions: MemoryRegion[];
  entryPoint?: number;
  format: ProgramFileFormat;
  sizeBytes: number;
  addressRange: string;
}
```

## Step 2: File format parsers

**Create** `src/lib/program-parser.ts`

Four exported functions:

- `detectFormat(data)` — auto-detect: `:` prefix → Intel HEX, `XXXX:` pattern → Woz hex, else binary
- `parseIntelHex(text)` — parse `:LLAAAATT[DD...]CC` records, validate checksums, return `ParsedProgram`
- `parseWozHexDump(text)` — parse `0300: A9 00 85 10 ...` lines, skip comments (`#`, `//`), return `ParsedProgram`
- `parseBinary(data, loadAddress)` — wrap raw bytes into a single region at given address
- `parseProgram(data, options?)` — unified entry point, auto-detects format

**Create** `src/lib/__tests__/program-parser.test.ts` — tests for all parsers + format detection

## Step 3: Next.js API route (proxy)

**Create** `src/app/api/fetch-program/route.ts`

POST handler that proxies external URL fetches to bypass CORS:

```
POST /api/fetch-program
Body: { "url": "https://..." }
Response: binary data + X-Detected-Format header
```

Security:
- Only http/https schemes
- Block private IPs (127.x, 10.x, 172.16-31.x, 192.168.x, localhost)
- 512KB size limit
- 10s timeout via AbortController
- Return detected format in response header

**Create** `src/lib/fetch-program.ts` — client-side wrapper:

```ts
export async function fetchProgram(url: string): Promise<{ data: Uint8Array; detectedFormat: ProgramFileFormat }>
```

## Step 4: Remote catalog entries

**Create** `src/emulator/apple1/remote-catalog.ts` — curated entries with URLs:

| Program | Address | URL Source | Format |
|---------|---------|------------|--------|
| INTEGER BASIC (full) | $E000-$EFFF | apple1js GitHub (MIT) | binary |
| LUNAR LANDER | $0300+ | apple1software.com | woz-hex-dump |
| STAR TREK | $0300+ | apple1software.com | woz-hex-dump |
| MASTERMIND | $0300+ | apple1software.com | woz-hex-dump |
| DISASSEMBLER | $0800+ | apple1js GitHub | binary |

**Modify** `src/emulator/apple1/software-catalog.ts` — add `getFullCatalog()` merging built-in + remote entries. Replace the Integer BASIC stub with the remote full version.

## Step 5: Refactor modal with three tabs

**Modify** `src/components/SoftwareLibraryModal.tsx`

Add top-level tabs: **BROWSE** | **URL** | **FILE**

Props gain `machine: MachineType`.

### BROWSE tab (existing catalog, enhanced)
- Same category filters + entry list + detail panel
- Remote entries (with `url`, empty `regions`) show "DOWNLOAD & LOAD" button
- Loading spinner (pulsing `*`), error message with [RETRY]

### URL tab (new)
```
URL: [________________________________]
FORMAT:  [AUTO] [BINARY] [HEX] [WOZ]
LOAD ADDRESS: [$0300]  (binary only)
ENTRY POINT:  [$0300]  (optional)
           [FETCH & LOAD]
```

### FILE tab (new)
```
+--------------------------------------------+
|                                            |
|    DROP FILE HERE                          |
|    or click to browse                      |
|    .bin  .hex  .ihx  .txt  .rom           |
|                                            |
+--------------------------------------------+
FORMAT:  [AUTO] [BINARY] [HEX] [WOZ]
LOAD ADDRESS: [$0300]  (binary only)
ENTRY POINT:  [$0300]  (optional)
```

Drag-drop zone with dashed terminal-green border. Hidden `<input type="file">`.

## Step 6: Update TerminalDisplay integration

**Modify** `src/components/TerminalDisplay.tsx`:

- Pass `machine` prop to modal
- Use `getFullCatalog()` instead of `APPLE1_SOFTWARE_CATALOG`
- Show LOAD button for both machines (not just Apple I)

## Files Summary

| File | Action |
|------|--------|
| `src/emulator/apple1/software-library.ts` | Modify (add url, format, machine fields + ParsedProgram) |
| `src/lib/program-parser.ts` | Create (format detection + 3 parsers) |
| `src/lib/__tests__/program-parser.test.ts` | Create (parser tests) |
| `src/app/api/fetch-program/route.ts` | Create (proxy API route) |
| `src/lib/fetch-program.ts` | Create (client fetch wrapper) |
| `src/emulator/apple1/remote-catalog.ts` | Create (curated remote entries) |
| `src/emulator/apple1/software-catalog.ts` | Modify (add getFullCatalog) |
| `src/components/SoftwareLibraryModal.tsx` | Modify (add BROWSE/URL/FILE tabs, loading states) |
| `src/components/TerminalDisplay.tsx` | Modify (pass machine, use full catalog) |

## Verification

1. `npm run build` — no TypeScript errors
2. `npm run dev` — LOAD button visible for both machines
3. BROWSE tab: built-in entries load instantly, remote entries show DOWNLOAD & LOAD
4. Click DOWNLOAD & LOAD on Integer BASIC — fetches via proxy, shows loading indicator, then confirmation
5. URL tab: paste a URL, select format, FETCH & LOAD works
6. FILE tab: drag a .bin file, auto-detects binary, loads at specified address
7. FILE tab: drag an Intel HEX file, auto-detects format, loads at embedded addresses
8. Error handling: invalid URL shows error with RETRY, unreachable URL shows timeout error
9. Parser tests pass: `npx vitest run src/lib/__tests__/program-parser.test.ts`

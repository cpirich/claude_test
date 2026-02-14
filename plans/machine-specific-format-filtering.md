# Plan: Machine-Specific File Format Filtering in Software Library Modal

## Context

The SoftwareLibraryModal shows all 6 file format options (AUTO, BINARY, HEX, WOZ, BAS, CMD) to every machine, but several formats are machine-specific:
- **WOZ** (Woz Monitor hex dump) — only meaningful for Apple I
- **BAS** / **CMD** — only meaningful for TRS-80

The `machine` prop is already passed to the modal but unused for format filtering. This change makes the format toggle buttons context-dependent so users only see formats relevant to the active machine.

## Format-to-Machine Mapping

| Format | Apple I | TRS-80 | Altair 8800 |
|--------|---------|--------|-------------|
| AUTO | yes | yes | yes |
| BINARY | yes | yes | yes |
| HEX (Intel HEX) | yes | yes | yes |
| WOZ | yes | no | no |
| BAS | no | yes | no |
| CMD | no | yes | no |

## Changes

### `src/components/SoftwareLibraryModal.tsx`

1. Add a machine-to-formats mapping:
   ```typescript
   const MACHINE_FORMATS: Record<MachineType, FormatOption[]> = {
     apple1: ["auto", "binary", "intel-hex", "woz-hex-dump"],
     trs80: ["auto", "binary", "intel-hex", "trs80-bas", "trs80-cmd"],
     altair8800: ["auto", "binary", "intel-hex"],
   };
   ```

2. Thread the `machine` prop into `UrlTab` and `FileTab` components (currently not passed down).

3. Filter the format toggle buttons using `MACHINE_FORMATS[machine]` instead of iterating all `FORMAT_LABELS` keys. Both the URL tab (around line 511) and File tab (around line 683) render identical format toggles — both need filtering.

4. Remove the unused `_machine` destructuring fix from the earlier lint cleanup — the prop will now be actively used.

### Files Modified
- `src/components/SoftwareLibraryModal.tsx` — the only file that needs changes

## Verification

1. `npm run lint` — no warnings
2. `npx tsc --noEmit` — type check passes
3. `npx vitest run` — all tests pass
4. Manual: Open each machine's software library modal and confirm only relevant format buttons appear

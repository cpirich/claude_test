# TRS-80 P4 Phosphor Styling & Rename Generic `.crt-screen`

## Context

The TRS-80 terminal uses a generic `.crt-screen` CSS class with pure white (#ffffff) text and white phosphor glow. The Altair 8800 has already been updated with its own `.altair-screen` class (green P1 phosphor, Matrix Sans Raster font), but the TRS-80 still uses the old generic class. Two issues remain:

1. **Historically inaccurate color**: The TRS-80 Model I's RCA monitor used P4 phosphor, which produces a warm off-white — not pure #ffffff.
2. **Generic class should be removed**: `.crt-screen` is now only used by TRS-80. Rename it to `.trs80-screen` so every machine has its own named class (matching `.apple1-screen` and `.altair-screen`).

Additionally, VT323 (based on 1987 DEC VT320) is a decade too modern for the TRS-80. The TRS-80's MCM6670P character generator produced 5x7 dot matrix characters — the same technology Matrix Sans Raster simulates.

## Changes

### 1. Add TRS-80 P4 phosphor CSS variables

**File**: `src/app/globals.css` (add after altair variables, ~line 18)

```css
--color-trs80-text: #e0dcd0;
--color-trs80-glow: rgba(224, 220, 208, 0.4);
--color-trs80-glow-soft: rgba(224, 220, 208, 0.1);
```

P4 phosphor: dual-layer (ZnS:Ag blue + Y₂O₂S:Eu yellow) producing warm off-white. `#e0dcd0` is subtly warm — distinguishable from pure white but still reads as "white."

### 2. Rename `.crt-screen` → `.trs80-screen` with P4 colors

**File**: `src/app/globals.css` (lines 107-140)

- Rename all three rules: `.crt-screen` → `.trs80-screen`, `.crt-screen pre` → `.trs80-screen pre`, `.crt-screen::after` → `.trs80-screen::after`
- Update box shadow outer glow to warm tint: `rgba(224, 220, 208, 0.04)`
- Update text shadow to use P4 variables: `var(--color-trs80-glow)` and `var(--color-trs80-glow-soft)`
- Update section comment to say "TRS-80" not generic "CRT"

### 3. Update `.trs80-terminal` text styling

**File**: `src/app/globals.css` (lines 182-188)

- Change font from `var(--font-vt323)` to `var(--font-matrix-raster), var(--font-vt323)` (same pattern as `.altair-terminal`)
- Change color from `#ffffff` to `var(--color-trs80-text)`

### 4. Update TRS-80 container class in component

**File**: `src/components/TerminalDisplay.tsx` (line 370)

Change `crt-screen` → `trs80-screen`.

### 5. Update tests

**File**: `src/components/__tests__/TerminalDisplay.test.tsx`

- Line 245: test name `"applies crt-screen class"` → `"applies trs80-screen class"`
- Lines 247, 259: selector `.crt-screen` → `.trs80-screen`

### 6. Update CLAUDE.md

Update the terminal display description to reflect that TRS-80 now uses Matrix Sans Raster and P4 phosphor styling instead of "White-on-black CRT styling."

## Files Modified

- `src/app/globals.css`
- `src/components/TerminalDisplay.tsx`
- `src/components/__tests__/TerminalDisplay.test.tsx`
- `CLAUDE.md`

## Verification

1. `npx vitest run` — all tests pass
2. `npx tsc --noEmit` — type check passes
3. `npm run lint` — lint passes
4. Manual: TRS-80 terminal shows warm off-white P4 text with 5x7 dot matrix font and matching soft glow

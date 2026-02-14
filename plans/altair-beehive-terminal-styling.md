# Plan: Beehive B100 Green Phosphor CRT Styling for Altair Terminal

## Context

The Altair 8800 terminal currently uses the generic `.crt-screen` class with white phosphor glow, and the `altair-terminal` CSS class has no definition. The Beehive B100 — the terminal commonly paired with the Altair 8800 — used a green P1 phosphor CRT with a 5x7 dot matrix character generator. We want to give the Altair terminal its own green phosphor CRT styling and a period-accurate dot matrix font.

## Font

**Matrix Sans Raster** (SIL Open Font License) — a 5x7 dot matrix font with a CRT raster variant that simulates horizontal phosphor scan lines. This closely matches the Beehive B100's character appearance.

- Source: https://github.com/FriedOrange/MatrixSans (v1.600)
- File: `MatrixSansRaster-Regular.woff2` (27KB)
- Loaded via `next/font/local` (same pattern as `next/font/google` but for self-hosted files)

## Changes

### New file: `src/fonts/MatrixSansRaster-Regular.woff2`
Extract from release zip and add to project.

### `src/app/layout.tsx`
Import `localFont` from `next/font/local`, load the woff2 file, create CSS variable `--font-matrix-sans-raster`, add to body className.

### `src/app/globals.css`

Add green phosphor CSS variables (alongside existing apple1 variables):
```css
--color-altair-text: #33ff33;
--color-altair-glow: rgba(51, 255, 51, 0.4);
--color-altair-glow-soft: rgba(51, 255, 51, 0.1);
```

Add `.altair-screen` container class (following `.apple1-screen` pattern):
- Green-tinted outer glow instead of white/blue
- Same scanline pattern
- Same border-radius (10px)

Add green phosphor text-shadow on `.altair-screen pre`:
```css
text-shadow: 0 0 4px var(--color-altair-glow),
             0 0 12px var(--color-altair-glow-soft);
```

Add `.altair-terminal` class:
- **Matrix Sans Raster** font at 28px, line-height 1.0
- Color: `var(--color-altair-text)`
- Fallback to VT323 then monospace

### `src/components/TerminalDisplay.tsx`

Change the Altair serial terminal container class from `crt-screen` to `altair-screen` (~line 580).

### Files Modified
- `src/fonts/MatrixSansRaster-Regular.woff2` — new font file
- `src/app/layout.tsx` — load Matrix Sans Raster via `next/font/local`
- `src/app/globals.css` — add altair CSS variables, `.altair-screen`, `.altair-terminal`
- `src/components/TerminalDisplay.tsx` — swap `crt-screen` → `altair-screen` on Altair container

## Verification

1. `npm run lint` — passes
2. `npx tsc --noEmit` — passes
3. `npx vitest run` — all tests pass
4. Manual: Navigate to `/altair8800`, confirm green phosphor glow, 5x7 dot matrix font with CRT raster lines, visible scanlines

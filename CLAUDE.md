# Claude Code — Project Notes

## Project Overview

Browser-based microcomputer emulator built with Next.js 16, React 19, and TypeScript. Emulates two early personal computers with cycle-accurate CPUs, authentic terminal displays, and CRT visual effects.

### Emulated Machines

**Apple I (1976)** — MOS 6502 @ 1.023 MHz, 40x24 terminal display, 4KB RAM, Woz Monitor ROM. Blue-white phosphor CRT styling. Serial terminal output (no framebuffer).

**TRS-80 Model I (1977)** — Zilog Z80 @ 1.774 MHz, 64x16 memory-mapped video, 48KB RAM, Level II BASIC ROM. White-on-black CRT styling with scanlines.

### Key Architecture

- `src/cpu/` — 6502 and Z80 CPU emulators (cycle-accurate instruction execution)
- `src/emulator/apple1/` — Apple I system (PIA, terminal, Woz Monitor, diagnostic ROMs)
- `src/emulator/trs80/` — TRS-80 system (keyboard matrix, video RAM, stub ROM)
- `src/components/` — React UI (TerminalDisplay with dynamic scale-to-fit, SoftwareLibraryModal)
- `src/hooks/` — React hooks (useApple1, useTrs80) bridging emulator to React state
- `src/lib/` — File format parsers (Intel HEX, Woz hex dump, TRS-80 .CMD, TRS-80 .BAS)
- `tests/e2e/` — Playwright end-to-end tests

### Terminal Display

Both terminals use VT323 font at 28px with dynamic `transform: scale()` to fill a 720x540 container. Character width is measured via a temporary span (not `scrollWidth`, which ignores trailing whitespace). CRT effects (scanlines, phosphor glow) are pure CSS.

### Software Loading

The SoftwareLibraryModal supports three loading methods: built-in catalog, URL fetch, and local file upload. Supported formats: .bin, .rom, .hex, .ihx, .txt (Woz hex), .cmd (TRS-80 executables), .bas (tokenized or plain text BASIC), .zip. Plain text .BAS files are typed into the emulator line-by-line via typeCommand.

## Plans

Project plans and design documents are stored in the `plans/` directory.

- [Microcomputer Emulator Selection](plans/microcomputer-emulator-selection.md) — Selected machines (Apple I, TRS-80 Model I), memory maps, test resources, and reference emulators

## UI Components

This project uses [shadcn/ui](https://ui.shadcn.com/) for UI components. When building new UI, prefer shadcn/ui components over hand-rolled HTML/CSS.

- **Add components**: `npx shadcn@latest add <component>` (e.g., `npx shadcn@latest add button`)
- **Config**: `components.json` in project root
- **Component location**: `src/components/ui/`
- **Utility function**: `cn()` from `@/lib/utils` for merging Tailwind classes
- **Installed components**: tabs, badge

The app is dark-mode only (terminal emulator). The `dark` class is set on `<html>` and CSS variables use the dark theme on `:root` directly. Custom terminal colors (`--color-terminal-green`, `--color-terminal-bg`, `--color-terminal-border`) are defined in `globals.css`.

## Testing

**IMPORTANT: Always run tests before committing changes.**

Before committing any code changes, you MUST verify:

1. **Type checking passes**: `npx tsc --noEmit`
2. **All tests pass**: `npx vitest run`

Both commands must succeed (exit code 0) before creating a commit. This ensures:
- Type safety is maintained across all TypeScript files
- No regressions in CPU emulation or UI components
- Integration tests validate end-to-end functionality

If type checking or tests fail, fix the issues before committing. Do not skip or disable tests without a clear reason and TODO comment explaining why.

## GitHub CLI

Due to sandbox proxy configuration, you need to use the `-R owner/repo` flag when using `gh` commands.

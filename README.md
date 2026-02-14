# Microcomputer Emulator

A browser-based emulator for early personal computers, featuring cycle-accurate CPU emulation, authentic CRT terminal displays, and a built-in software library.

**Live demo: [cpirich.github.io/claude_test](https://cpirich.github.io/claude_test/)**

## Emulated Machines

### Apple I (1976)

- **CPU**: MOS 6502 @ 1.023 MHz
- **Display**: 40x24 character terminal (blue-white phosphor)
- **Memory**: 4KB RAM, 256-byte Woz Monitor ROM
- **I/O**: Motorola 6821 PIA (keyboard input, serial display output)

The Apple I was Steve Wozniak's hand-built computer — a pure terminal with no framebuffer. Characters are output serially, just like the original hardware.

### TRS-80 Model I (1977)

- **CPU**: Zilog Z80 @ 1.774 MHz
- **Display**: 64x16 character memory-mapped video (white on black)
- **Memory**: 12KB ROM (Level II BASIC), 48KB user RAM, 1KB video RAM
- **I/O**: Memory-mapped keyboard matrix, 40Hz timer interrupts

Radio Shack's first personal computer, with memory-mapped video RAM at $3C00-$3FFF and a full Microsoft BASIC interpreter.

## Features

- **Cycle-accurate CPU emulation** for both 6502 and Z80
- **Authentic CRT effects** — scanlines, phosphor glow, text shadows (pure CSS)
- **Dynamic scale-to-fit** — chunky VT323 characters fill the 4:3 display frame
- **Built-in software library** with categorized programs (languages, diagnostics, utilities, demos)
- **Load from anywhere** — built-in catalog, URL fetch, or drag-and-drop local files
- **Multiple file formats** — .bin, .rom, .hex, .cmd (TRS-80 executables), .bas (BASIC programs), .zip
- **Keyboard input** — type directly into the terminal, just like the real hardware
- **Copy terminal text** to clipboard

## Software Library

### Apple I

| Program | Type | Description |
|---------|------|-------------|
| Woz Monitor | Built-in ROM | Memory examine/deposit, program execution |
| Integer BASIC | Remote (4KB) | Steve Wozniak's BASIC interpreter |
| Screen Fill Test | Diagnostic ROM | Fills display with cycling ASCII characters |
| DRAM Test | Diagnostic ROM | Tests RAM with 4 bit patterns |
| Keyboard Echo | Diagnostic ROM | TV typewriter echo test |
| Hex Monitor | Diagnostic ROM | Minimal hex peek/poke |

### TRS-80

| Program | Type | Description |
|---------|------|-------------|
| Level II BASIC | Remote (12KB) | Microsoft BASIC with strings, arrays, graphics |
| Level I BASIC | Remote (4KB) | Original integer-only BASIC |
| Diagnostic ROM | Remote | Hardware test (RAM, video, keyboard) |

## File Format Support

| Format | Extension | Description |
|--------|-----------|-------------|
| Binary | .bin, .rom | Raw binary with configurable load address |
| Intel HEX | .hex, .ihx | Industry-standard with embedded addresses |
| Woz Hex Dump | .txt | Apple I monitor format (addr: bytes) |
| TRS-80 CMD | .cmd | Machine language executables (record-based) |
| TRS-80 BAS | .bas | Tokenized or plain text BASIC programs |
| ZIP Archive | .zip | Browse and extract files from archives |

## Tech Stack

- **Framework**: Next.js 16, React 19, TypeScript 5
- **Styling**: TailwindCSS 4, shadcn/ui components
- **Fonts**: VT323 (retro terminal), Geist Mono (UI)
- **Testing**: Vitest (600+ unit tests), Playwright (e2e tests)
- **Deployment**: GitHub Pages via GitHub Actions

## Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Run type checking
npx tsc --noEmit

# Run unit tests
npx vitest run

# Run e2e tests
npm run test:e2e
```

## License

MIT

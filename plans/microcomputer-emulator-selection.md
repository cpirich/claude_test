# Microcomputer Emulator — Project Plan

A browser-based terminal-style web app that emulates early microcomputers, built with TypeScript and Next.js.

## Selected Microcomputers

### Phase 1: Apple I (1976)

- **CPU**: MOS 6502 at 1.023 MHz
- **Display**: 40x24 characters, uppercase only, pure terminal-style output
- **I/O**: 4 memory-mapped registers (`$D010-$D013`) via Motorola 6821 PIA
- **ROM**: 256-byte Woz Monitor at `$FF00-$FFFF`
- **Why**: The Apple I *is* a terminal. Characters are output sequentially like a teletype. No framebuffer, no screen editor, no CRTC chip. This maps directly to a `<pre>` element in a browser.

#### Memory Map

| Address Range | Contents |
|---|---|
| `$0000-$00FF` | Zero page (fast-access RAM) |
| `$0100-$01FF` | Stack |
| `$0200-$027F` | Input buffer (128 bytes) |
| `$0280-$0FFF` | General-purpose RAM |
| `$D010` | KBD — PIA keyboard data register (read) |
| `$D011` | KBDCR — PIA keyboard control register (bit 7 = key available) |
| `$D012` | DSP — PIA display data register (write) |
| `$D013` | DSPCR — PIA display control register (bit 7 = display ready) |
| `$E000-$EFFF` | Integer BASIC (loaded from cassette or provided in ROM) |
| `$FF00-$FFFF` | Woz Monitor ROM (256 bytes) |

#### Test Resources

- **Klaus Dormann's 6502 Functional Test Suite** — gold standard for 6502 CPU verification ([GitHub](https://github.com/Klaus2m5/6502_65C02_functional_tests))
- **Bruce Clark's decimal mode tests** — exhaustive ADC/SBC BCD tests
- **Apple-1 Diagnostic PROMs** — screen fill, DRAM test, hexmon ([Applefritter](https://www.applefritter.com/content/announcing-novel-diagnostic-prom-set-apple-1-builders))
- **Apple-1 Software Library** — complete collection of known Apple-1 programs ([apple1software.com](https://apple1software.com/))

#### Reference Documentation

- Complete annotated Woz Monitor disassembly at [sbprojects.net](https://www.sbprojects.net/projects/apple1/wozmon.php)
- Apple 1 Operation Manual (original scans freely available)
- Integer BASIC documentation at [sbprojects.net](https://www.sbprojects.net/projects/apple1/a1basic.php)
- Cassette Interface (ACI) documentation at [sbprojects.net](https://www.sbprojects.net/projects/apple1/aci.php)
- 6502 CPU resources at [6502.org](http://www.6502.org/) and [Visual 6502](http://visual6502.org/)

#### Reference Emulators

- **apple1js** by Will Scullin — JavaScript/HTML5 ([GitHub](https://github.com/whscullin/apple1js))
- **Apple1JS** by Stefano Prina — TypeScript/React ([GitHub](https://github.com/stid/Apple1JS))
- **napple1** — ncurses terminal-based ([GitHub](https://github.com/nobuh/napple1))
- **MAME** — includes Apple I driver

---

### Phase 2: TRS-80 Model I (1977)

- **CPU**: Zilog Z80 at 1.774 MHz
- **Display**: 64x16 characters, memory-mapped video RAM at `$3C00-$3FFF`
- **I/O**: Memory-mapped keyboard matrix at `$3800-$3BFF`, 12K BASIC ROM
- **Why**: Still text-only but introduces memory-mapped video and a different CPU architecture (Z80 vs 6502). Ensures genuinely different emulation infrastructure.

#### Memory Map

| Address Range | Contents |
|---|---|
| `$0000-$2FFF` | Level II BASIC ROM (12K) |
| `$3000-$37FF` | Additional ROM / unused |
| `$3800-$3BFF` | Keyboard memory-mapped matrix (1K) |
| `$3C00-$3FFF` | Video RAM (1K, 64x16 characters) |
| `$4000-$FFFF` | User RAM (up to 48K with Expansion Interface) |

#### Test Resources

- **ZEXALL / ZEXDOC** — gold standard for Z80 CPU verification (exhaustive instruction testing against CRC values from real hardware)
- **z80test by Patrik Rak** — comprehensive test suite covering documented and undocumented behavior ([GitHub](https://github.com/raxoft/z80test))
- **TRS-80 Diagnostic ROM** — tests RAM, video, keyboard, and ROM ([GitHub](https://github.com/misterblack1/trs80-diagnosticrom))
- **TRS-80 software library** — thousands of programs at [trs-80.com](https://www.trs-80.com/)

#### Reference Documentation

- Fully annotated ROM disassemblies at [trs-80.com](https://www.trs-80.com/main-internal-rom-related.htm)
- Original Radio Shack TRS-80 Technical Reference Manual (publicly available)
- Zilog Z80 CPU User Manual (publicly available)

#### Reference Emulators

- **trs80** by Lawrence Kesteloot — TypeScript, browser-based ([GitHub](https://github.com/lkesteloot/trs80))
- **trs80gp** by George Phillips — community reference emulator ([48k.ca](http://48k.ca/trs80gp.html))
- **sdltrs** — open-source SDL-based emulator
- **TRuSt-80** — Rust-based ([GitHub](https://github.com/nicolasbauw/TRS-80))

---

## Comparison

| | Apple I | TRS-80 Model I |
|---|---|---|
| CPU | 6502 | Z80 |
| Complexity | Minimal (256B ROM) | Low-moderate (12K ROM) |
| Display model | Serial terminal | Memory-mapped text |
| CPU test suite | Klaus Dormann | ZEXALL/ZEXDOC |
| Existing TS emulators | Yes | Yes |

## Candidates Considered and Rejected

- **Commodore PET 2001**: Full screen editor and 6545 CRTC chip make it too complex for a pure terminal-style interface
- **KIM-1**: No video output (hex keypad + LED display only); too primitive
- **Altair 8800**: Native interface is toggle switches and LEDs, not terminal-based
- **Ohio Scientific Superboard II**: Insufficient public documentation and test resources compared to the selected machines

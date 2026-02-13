# Apple-1 Diagnostic PROM Tests

Integration tests that validate the Apple-1 emulator by running diagnostic ROM programs through the full CPU → Memory → PIA → Display pipeline.

## Background

The original Apple-1 diagnostic PROMs were designed by UncleBernie for Apple-1 builders ([Applefritter](https://www.applefritter.com/content/announcing-novel-diagnostic-prom-set-apple-1-builders)). They solve a critical bootstrap problem: the Woz Monitor crashes when RAM is dysfunctional, making it impossible to diagnose hardware faults through normal means.

These test ROMs replicate the same I/O patterns and diagnostic functionality for emulator verification.

## Test ROMs

### 1. Screen Fill (`SCREEN_FILL_ROM`)

Fills the 40×24 display with all printable ASCII characters ($20–$5F), cycling through the 64-character Apple-1 displayable range. Outputs exactly 960 characters followed by a carriage return.

**Verifies**: PIA display output ($D012), display ready polling ($D012 bit 7), character generation, screen capacity.

### 2. DRAM Test (`DRAM_TEST_ROM`)

Writes four test patterns ($00, $FF, $55, $AA) across RAM pages $02–$0F, then reads back and compares. Outputs `P` (pass) or `F` (fail).

**Verifies**: RAM read/write, zero page indirect addressing, PIA display output. The test includes a "corrupted RAM" variant that injects bit errors to verify failure detection.

### 3. Keyboard Echo / TV Typewriter (`KEYBOARD_ECHO_ROM`)

Polls the PIA keyboard register ($D010/$D011) and echoes each keystroke to the display ($D012).

**Verifies**: PIA keyboard input polling, keyboard data read, display echo, full I/O loop.

### 4. Hex Monitor (`HEX_MONITOR_ROM`)

Reads two hex digit keystrokes, echoes them, and outputs an `=` separator followed by CR. Operates without RAM (register-only housekeeping).

**Verifies**: Multi-step keyboard input sequences, display output sequencing, RAM-independent operation.

## Files

| File | Purpose |
|---|---|
| `src/emulator/apple1/roms/diagnostic-roms.ts` | Test ROM binary data (6502 machine code as `Uint8Array`) |
| `src/emulator/apple1/memory.ts` | Apple1Memory bus adapter (RAM + ROM + PIA) |
| `diagnostic-harness.ts` | Standalone test harness with PIA simulation and verification functions |
| `diagnostic-proms.test.ts` | Unit tests using stub CPU (16 tests) |
| `diagnostic-integration.test.ts` | Integration tests using production CPU, PIA, Terminal (20 tests) |

## Running

```bash
# All Apple-1 diagnostic tests (36 tests)
npm test -- src/test/apple1/

# Unit tests only (stub CPU)
npm test -- src/test/apple1/diagnostic-proms.test.ts

# Integration tests only (production CPU + PIA + Terminal + Memory)
npm test -- src/test/apple1/diagnostic-integration.test.ts
```

## Test Architecture

### Unit Tests (`diagnostic-proms.test.ts`)

Use a `StubCpu6502` (minimal 6502 interpreter covering only the opcodes used by the diagnostic ROMs) and the `DiagnosticHarness` which provides its own PIA simulation. These tests run without any external dependencies and validate the ROM logic in isolation.

### Integration Tests (`diagnostic-integration.test.ts`)

Wire together all production components:
- `Cpu6502` — full 6502 emulator core
- `PIA` — production PIA with display callback
- `Apple1Memory` — memory bus routing RAM/ROM/PIA
- `Terminal` — 40×24 character display
- `WozMonitorROM` — authentic Woz Monitor firmware

Integration tests cover:
- **Woz Monitor boot**: backslash prompt, keyboard polling, character echo, hex memory dump
- **Screen fill**: 960-character output verified on both raw display and Terminal
- **DRAM test**: pass/fail with actual RAM, memory page verification
- **Keyboard echo**: PIA keyboard → CPU → PIA display → Terminal
- **Hex monitor**: multi-step input/output sequences
- **PIA routing**: keyboard data delivery, display write routing, ROM protection
- **Terminal behavior**: 40-column wrapping, CR handling, scroll

## Verification Functions

- `verifyScreenFill()` — checks character count (960), cycling pattern ($20–$5F), and final CR
- `verifyDRAMTest()` — checks for 'P' (pass) or 'F' (fail) output character
- `verifyKeyboardEcho()` — checks that input characters appear in display output
- `verifyHexMonitor()` — checks two-digit echo with '=' separator and CR

## PIA Register Summary

| Address | Name | Direction | Function |
|---|---|---|---|
| $D010 | KBD | Read | Keyboard data (bit 7 set = valid) |
| $D011 | KBDCR | Read | Keyboard control (bit 7 = key available) |
| $D012 | DSP | Write | Display data (bit 7 set by hardware when busy) |
| $D013 | DSPCR | R/W | Display control |

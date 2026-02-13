# Fix Altair BASIC ROM "MEMORY SIZE?" Prompt & Add Integration Tests

## Context

The MITS Altair 8800 emulator loads BASIC ROMs but never shows the "MEMORY SIZE?" prompt. Root cause: the BASIC ROM's init code reads sense switches (port 0xFF) to determine serial board configuration. Our emulator returns 0xFF for unmapped ports, which causes BASIC to skip the 2SIO serial port patching code entirely, leaving serial I/O on unhandled SIO ports (0x00/0x01).

With sense switches = 0xFF: value 0x3C matches the first CPI check at 0x0D2A, causing an early return from init — no serial port configuration occurs.

With sense switches = 0x00 (the correct default): BASIC configures for the 2SIO board (ports 0x10/0x11), which our emulator already handles correctly.

## Changes

### 1. Fix default port return value in serial.ts

**File**: `src/emulator/altair8800/serial.ts`

Change the default return for unmapped ports from `0xFF` to `0x00` (line 77):
```
- return 0xff;
+ return 0x00;
```

This matches real hardware (sense switches default to off = 0x00), matches py8080's behavior, and is benign for all other unmapped ports.

### 2. Update serial unit test

**File**: `src/emulator/altair8800/__tests__/serial.test.ts`

Update the "other ports" test (line 110-114) to expect 0x00 instead of 0xFF for unmapped ports.

### 3. Add BASIC program integration tests for the Altair 8800

**File**: `src/emulator/altair8800/__tests__/basic-integration.test.ts` (new)

Mirror the TRS-80 `basic-integration.test.ts` pattern but adapted for the 8080 CPU and serial I/O. Tests use hand-assembled 8080 machine code that exercises the same CPU, stack, and serial I/O paths that real BASIC interpreters use.

Key differences from TRS-80 tests:
- Output via serial OUT to port 0x11 (not video RAM writes)
- 8080 instruction set (no Z80-only instructions like DJNZ, JR, IX/IY)
- Capture output via serial output callback

Test cases:
- **PRINT string output**: Serial output of "HELLO WORLD" via OUT 0x11 polling loop
- **Multiple lines**: CR/LF output for multi-line display
- **Arithmetic**: Compute and print 2+2=4, 7*8=56, three-digit numbers
- **FOR loop**: Print numbers 1-5 using counted loop
- **Sense switch init**: Verify sense switches (port 0xFF) return 0x00 and BASIC-style serial config works

Each test builds a small ROM with:
- A CHAR_OUT subroutine (polls 2SIO status, outputs character)
- A PRINT_NUM subroutine (converts byte to decimal ASCII digits)
- A NEWLINE subroutine (outputs CR/LF)
- Main program at 0x0000

## Verification

1. `npx vitest run src/emulator/altair8800/__tests__/serial.test.ts` — serial tests pass with updated default
2. `npx vitest run src/emulator/altair8800/__tests__/basic-integration.test.ts` — new integration tests pass
3. `npx vitest run` — all tests pass
4. `npx tsc --noEmit` — type check passes
5. `npm run lint` — lint passes

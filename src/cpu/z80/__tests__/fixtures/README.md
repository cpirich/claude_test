# Z80 CPU Test Fixtures

Pre-assembled binaries for verifying the Z80 CPU emulator.

## Files

### `zexdoc.com` (8,704 bytes)

**ZEXDOC — Z80 Documented Instruction Exerciser**

Tests only documented Z80 flag behavior (undocumented flag bits 3 and 5 are masked out).

- **Source**: https://github.com/agn453/ZEXALL
- **Format**: CP/M .COM executable (loaded at $0100)
- **Entry point**: $0100 (JP $0113)
- **Environment**: Minimal CP/M — BDOS at $0005, warm boot at $0000
- **BDOS calls used**: Function 2 (print char in E), Function 9 (print $-terminated string at DE)
- **Completion**: Program returns to $0000 (warm boot)
- **Test groups**: 67 instruction categories
- **Output**: Each group prints "name...OK" or "name... ERROR **** crc expected:XXXX found:XXXX"

### `zexall.com` (8,704 bytes)

**ZEXALL — Z80 Full Instruction Exerciser**

Tests all Z80 flag behavior including undocumented flag bits 3 (F3/XF) and 5 (F5/YF).

Same format and environment as ZEXDOC. Requires accurate undocumented flag emulation to pass all tests.

## CP/M Environment Requirements

The test harness (`zex-harness.ts`) provides:
1. 64KB flat RAM
2. .COM binary loaded at $0100
3. RET instruction at $0005 (BDOS entry), intercepted before execution
4. HALT at $0000 (warm boot detection)
5. $0000 pushed on stack as return address
6. SP initialized to $FFFE

## Running the Tests

```sh
npx vitest run src/cpu/z80/__tests__/zexdoc.test.ts
```

Note: ZEXDOC takes several minutes to run (~5.7 billion instructions).

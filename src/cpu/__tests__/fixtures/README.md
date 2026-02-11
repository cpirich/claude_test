# 6502 CPU Test Fixtures

Pre-assembled binaries for verifying the 6502 CPU emulator.

## Files

### `6502_functional_test.bin` (65,536 bytes)

**Klaus Dormann's 6502 Functional Test Suite** — gold standard for 6502 CPU verification.

- **Source**: https://github.com/Klaus2m5/6502_65C02_functional_tests
- **Format**: Full 64KB memory image (loaded at $0000)
- **Entry point**: $0400 (set PC directly; do NOT use reset vector)
- **Success**: JMP-to-self trap at $3469
- **Failure**: JMP-to-self trap at any other address
- **Configuration**: `load_data_direct=1`, `disable_decimal=0`

Tests all documented 6502 instructions and addressing modes including
load/store, arithmetic (binary + BCD), logic, shifts, branches, jumps,
stack ops, flag ops, and transfers.

### `6502_decimal_test.bin` (65,024 bytes)

**Bruce Clark's Decimal Mode Test** — exhaustive ADC/SBC BCD verification.

- **Source**: http://www.6502.org/tutorials/decimal_mode.html
- **Format**: Binary starting at $0200 (load at offset $0200)
- **Entry point**: $0200
- **Success**: JMP-to-self trap at $024B with ERROR ($0B) = 0
- **Failure**: JMP-to-self trap at $024B with ERROR ($0B) = 1
- **Configuration**: `cputype=0` (NMOS 6502), `vld_bcd=0`, checks A and C flags

Tests all 65,536 combinations of two 8-bit operands for both ADC and SBC
in decimal mode, with both carry states.

### Assembly Sources

- `6502_decimal_test.a65` — Original AS65-syntax source (from Klaus Dormann's repo)
- `6502_decimal_test_ca65.s` — Converted to ca65 syntax (used to build the .bin)

To rebuild the decimal test binary (requires cc65 toolchain):
```sh
ca65 -o decimal.o 6502_decimal_test_ca65.s
ld65 -o 6502_decimal_test.bin -C decimal_test.cfg decimal.o
```

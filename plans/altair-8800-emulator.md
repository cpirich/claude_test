# Plan: MITS Altair 8800 Emulator

## Context

The project emulates the Apple I (6502) and TRS-80 Model I (Z80) as terminal-based microcomputers in a Next.js app. We're adding the MITS Altair 8800 (Intel 8080, 1975) as a third machine with **equivalent functionality**: CPU emulation, memory system, I/O, software catalog, terminal display, tests, and e2e coverage.

The Altair is unique in that it also needs a **front panel UI** (the iconic blue panel with toggle switches and LEDs) alongside a serial terminal (via 2SIO board). Both views will be displayed together.

## New Files

```
src/cpu/i8080/
  i8080.ts              # Intel 8080 CPU emulator
  types.ts              # 8080-specific types (reuses Memory + IOBus interfaces)
  index.ts              # Public exports
  __tests__/
    i8080.test.ts       # Unit tests for instructions
    8080ex1.test.ts     # 8080EX1 exhaustive test suite (CP/M BDOS harness)
    8080-test-harness.ts # Test harness (like zex-harness.ts)

src/emulator/altair8800/
  system.ts             # Altair8800System orchestrator
  memory.ts             # Memory bus (64K RAM, no ROM by default)
  serial.ts             # 2SIO serial board (Motorola 6850 ACIA on ports 0x10-0x11)
  front-panel.ts        # Front panel state model (switches, LEDs, operations)
  software-catalog.ts   # Software entries (Altair BASIC, Kill the Bit, etc.)
  roms/
    turnkey-boot.ts     # Small bootstrap ROM (optional, loads at 0xFF00 or similar)
  __tests__/
    system.test.ts
    memory.test.ts
    serial.test.ts
    front-panel.test.ts

src/hooks/
  useAltair8800.ts      # React hook managing emulator instance + RAF loop

src/components/
  Altair8800Terminal.tsx # Serial terminal display (80×24)
  Altair8800Panel.tsx   # Front panel UI (switches, LEDs)
  __tests__/
    Altair8800Panel.test.tsx

tests/e2e/
  altair8800.spec.ts    # E2E tests
```

## Modified Files

```
src/app/[machine]/page.tsx          # Add "altair8800" to VALID_MACHINES
src/components/EmulatorPage.tsx     # Add to Machine type + MACHINES record + tab rendering
src/components/TerminalDisplay.tsx  # Add Altair8800 terminal + panel rendering
src/components/MachineInfo.tsx      # Add Altair 8800 info, history, tips
src/emulator/apple1/software-library.ts  # Add "altair8800" to MachineType
tests/e2e/helpers.ts               # Add altair8800 helpers if needed
```

---

## 1. Intel 8080 CPU (`src/cpu/i8080/`)

### Interface

```typescript
// src/cpu/i8080/types.ts
// Reuse Memory from src/cpu/types.ts and IOBus from src/cpu/z80/types.ts
// (or define locally — same shape)
export interface I8080State {
  a: number; f: number;           // Accumulator + flags
  b: number; c: number;           // BC pair
  d: number; e: number;           // DE pair
  h: number; l: number;           // HL pair
  sp: number; pc: number;         // Stack pointer, program counter
  cycles: number;
  halted: boolean;
  interruptsEnabled: boolean;
}
```

```typescript
// src/cpu/i8080/i8080.ts
export class I8080 {
  constructor(memory: Memory, io?: IOBus)
  reset(): void           // PC=0, SP=0, flags=0x02, interrupts disabled
  step(): number          // Execute one instruction, return cycles consumed
  run(cycles: number): number  // Run until cycle budget exhausted
  irq(rstVector: number): void // Interrupt with RST 0-7 vector
  // Register accessors
  get/set a, f, b, c, d, e, h, l, sp, pc
  get/set bc, de, hl, af  // 16-bit pair accessors
  get halted: boolean
  get cycles: number
  get interruptsEnabled: boolean
}
```

### Instruction set

- 256 opcodes (no prefix groups unlike Z80)
- Opcode table approach: array of 256 handler functions (same pattern as 6502's `opcodes.ts`)
- Flag register layout: `S Z 0 AC 0 P 1 CY` (bits 7→0). Bit 1 always 1, bits 3,5 always 0
- Key instruction groups: MOV, MVI, LXI, LDA/STA, LDAX/STAX, ADD/ADC/SUB/SBB/ANA/XRA/ORA/CMP, INR/DCR, INX/DCX, DAD, DAA, RLC/RRC/RAL/RAR, JMP/CALL/RET (conditional variants), PUSH/POP, RST, IN/OUT, EI/DI, HLT, NOP, XCHG, XTHL, SPHL, PCHL
- Parity lookup table (like Z80's `tables.ts`)

### Testing

- **Unit tests**: Test each instruction group (arithmetic, logic, branches, stack, I/O)
- **8080EX1/TST8080**: Port the CP/M-based test suite using a BDOS call harness (trap CALL 5 at address 0x0005 for console output — same pattern as `zex-harness.ts`)

---

## 2. Altair 8800 System (`src/emulator/altair8800/`)

### Memory Map

```
$0000-$FFFF  64K RAM (all read/write by default)
```

No ROM in standard configuration. Programs are entered via front panel DEPOSIT or loaded from serial/software catalog. Optionally, a small turnkey bootstrap ROM can be mapped at a high address.

### 2SIO Serial Board (`serial.ts`)

Emulates Motorola 6850 ACIA on I/O ports:
- **Port 0x10** (status): bit 0 = RX data ready, bit 1 = TX buffer empty (always 1)
- **Port 0x11** (data): read = next input character, write = output character
- Implements `IOBus` interface — the system's I/O handler routes ports 0x10-0x11 here
- Output callback sends characters to terminal buffer
- Input buffer fed by keyboard events (queue of ASCII bytes)

### Front Panel State (`front-panel.ts`)

```typescript
export class AltairFrontPanel {
  // Switch state
  addressSwitches: number    // 16-bit (A15-A0)
  dataSwitches: number       // 8-bit (D7-D0, active via sense switches)

  // LED state (updated from CPU each step/halt)
  addressLEDs: number        // 16-bit — current address bus
  dataLEDs: number           // 8-bit — current data bus
  statusLEDs: number         // INTE, MEMR, INP, M1, OUT, HLTA, STACK, WO, PROT

  // Operations (triggered by momentary control switches)
  examine(): void            // Load addressSwitches → PC, read mem[PC] → dataLEDs
  examineNext(): void        // PC++, read mem[PC] → dataLEDs
  deposit(): void            // Write dataSwitches → mem[PC]
  depositNext(): void        // PC++, write dataSwitches → mem[PC]
  run(): void                // Start CPU execution
  stop(): void               // Halt CPU execution
  singleStep(): void         // Execute one instruction
  reset(): void              // CPU reset (PC=0)
}
```

### System Orchestrator (`system.ts`)

```typescript
export class Altair8800System {
  readonly cpu: I8080
  readonly memory: AltairMemory
  readonly serial: Altair2SIO
  readonly panel: AltairFrontPanel
  private running: boolean

  reset(): void
  run(cycles: number): number    // Run CPU for N cycles, update panel LEDs
  loadSoftware(entry: SoftwareEntry): void
}
```

Clock speed: **2 MHz** → ~33,333 cycles/frame at 60 FPS.

---

## 3. Front Panel UI (`src/components/Altair8800Panel.tsx`)

Visual representation of the Altair 8800 front panel using Tailwind CSS:

- **Layout**: Horizontal panel, dark blue/gray background
- **Top row**: Status LEDs (red circles, lit/unlit), Address LEDs (A15-A0), Data LEDs (D7-D0)
- **Bottom row**: Address/data toggle switches (clickable, flip up/down), control switches (momentary push)
- **Toggle switches**: Styled as vertical toggles; click toggles between up (1) and down (0)
- **Momentary switches**: RUN, STOP, SINGLE STEP, EXAMINE, EXAMINE NEXT, DEPOSIT, DEPOSIT NEXT, RESET, CLR — trigger on click, don't latch
- LED grouping: visual octal grouping (groups of 3) for address bits, as on the real hardware

### Combined Layout

The Altair page shows **front panel above, serial terminal below**:
```
┌─────────────────────────────────────┐
│  [ALTAIR 8800 FRONT PANEL]          │
│  LEDs: ○○○ ○○○ ○○○ ○○○ ○○○ ○○○    │
│  Switches: ↑↓↑ ↓↓↑ ...  [RUN] ... │
├─────────────────────────────────────┤
│  Serial Terminal (80×24)            │
│  > MEMORY SIZE?                     │
│  > 32768                            │
│  > ALTAIR BASIC 4K                  │
│  > OK                               │
│  > _                                │
└─────────────────────────────────────┘
```

---

## 4. App Integration

### Route & Machine Registry

- Add `"altair8800"` to `VALID_MACHINES` in `src/app/[machine]/page.tsx`
- Add to `MACHINES` in `EmulatorPage.tsx`:
  ```typescript
  altair8800: { label: "Altair 8800", spec: "8080 @ 2 MHz · 80×24 + Panel" }
  ```
- Add `"altair8800"` to `MachineType` in `software-library.ts`

### Hook (`useAltair8800.ts`)

Following `useApple1.ts` / `useTrs80.ts` patterns:
- Creates `Altair8800System` instance
- RAF loop calls `system.run(CYCLES_PER_FRAME)` when panel says running
- Exposes: `{ state, panelState, onKeyDown, onKeyUp, reset, loadSoftware, typeCommand, panelAction }`
- `panelAction(action)` dispatches EXAMINE, DEPOSIT, RUN, STOP, etc.
- `panelState` includes LED values, switch positions, running status

### Terminal & Panel Display

`TerminalDisplay.tsx` gains an `altair8800` branch that renders:
1. `Altair8800Panel` (front panel component, above)
2. `Altair8800Terminal` (serial terminal, below — 80×24 character grid)

### MachineInfo

Add Altair 8800 historical info, image attribution, quick-start tips:
- "Flip switches to enter a program, or load Altair BASIC from the software library"
- Front panel operation guide (EXAMINE, DEPOSIT, RUN)
- Altair BASIC commands when BASIC is loaded

### Software Catalog

```typescript
// src/emulator/altair8800/software-catalog.ts
entries:
- Kill the Bit (front panel game, ~20 bytes, entered via DEPOSIT)
- Altair BASIC 4K (remote load, needs serial terminal)
- Altair BASIC 8K (remote load)
- Simple diagnostic/test programs
```

---

## 5. Testing Plan

| Component | Test File | What to Test |
|-----------|-----------|-------------|
| I8080 CPU | `i8080.test.ts` | Instruction groups, flags, interrupts, halt |
| I8080 CPU | `8080ex1.test.ts` | Exhaustive instruction test (CP/M harness) |
| Memory | `memory.test.ts` | Read/write full 64K, boundary behavior |
| 2SIO Serial | `serial.test.ts` | Status register, TX/RX, character buffering |
| Front Panel | `front-panel.test.ts` | EXAMINE, DEPOSIT, RUN/STOP, LED updates |
| System | `system.test.ts` | Wiring, reset, run loop, software loading |
| Panel UI | `Altair8800Panel.test.tsx` | Switch clicks, LED rendering, action dispatch |
| E2E | `altair8800.spec.ts` | Page load, front panel interaction, BASIC boot |

---

## 6. Parallel Work Streams for Agent Teams

The work divides into **4 parallel streams** with a final **integration stream**:

### Stream 1: Intel 8080 CPU
**Scope**: `src/cpu/i8080/` (all files)
**Dependencies**: None (standalone)
**Interface contract**: Must export `I8080` class with `constructor(memory: Memory, io?: IOBus)`, `reset()`, `step(): number`, `run(cycles): number`, `irq(vector)`, register accessors, `halted`, `cycles`, `interruptsEnabled`
**Deliverables**: Full CPU implementation + unit tests + 8080EX1 test harness

### Stream 2: Altair System Emulation
**Scope**: `src/emulator/altair8800/` (system.ts, memory.ts, serial.ts, front-panel.ts, software-catalog.ts, roms/, all __tests__/)
**Dependencies**: Depends on Stream 1's `I8080` class interface (can stub/mock CPU initially, wire real CPU when Stream 1 delivers)
**Interface contract**: Must export `Altair8800System` with `reset()`, `run(cycles): number`, `loadSoftware(entry)`, plus expose `cpu`, `memory`, `serial`, `panel` subsystems
**Deliverables**: All system emulation code + unit tests for each subsystem

### Stream 3: Front Panel UI Component
**Scope**: `src/components/Altair8800Panel.tsx`, `src/components/__tests__/Altair8800Panel.test.tsx`
**Dependencies**: Depends on Stream 2's `AltairFrontPanel` interface for LED/switch state shape (can define types first, implement against interface)
**Interface contract**: React component accepting panel state (LEDs, switches) and action callback
**Deliverables**: Front panel component with switches, LEDs, styling + component tests

### Stream 4: App Integration & Terminal
**Scope**: All modified files (EmulatorPage.tsx, TerminalDisplay.tsx, MachineInfo.tsx, page.tsx, software-library.ts, helpers.ts) + `src/hooks/useAltair8800.ts` + `src/components/Altair8800Terminal.tsx` + `tests/e2e/altair8800.spec.ts`
**Dependencies**: Depends on Streams 2 & 3 for system + panel component (can scaffold with stubs initially)
**Deliverables**: Full app integration, hook, terminal component, e2e tests

### Dependency Graph

```
Stream 1 (CPU) ──────────┐
                          ├──→ Stream 4 (Integration)
Stream 2 (System) ───────┤
                          │
Stream 3 (Panel UI) ─────┘
```

Streams 1, 2, and 3 can start **simultaneously**:
- Stream 1 works fully independently
- Stream 2 can mock the CPU with a minimal stub implementing the I8080 interface
- Stream 3 can work against a TypeScript interface for panel state without the real implementation

Stream 4 (Integration) should start after Streams 1-3 have their core interfaces defined, but can scaffold the hook and route changes early using stubs, then wire everything together.

---

## Verification

After implementation, verify end-to-end:

1. `npx tsc --noEmit` — type checking passes
2. `npx vitest run` — all unit tests pass (including new 8080 + Altair tests)
3. `npx playwright test` — e2e tests pass
4. Manual: Navigate to `/altair8800`, see front panel + terminal
5. Manual: Toggle switches, click DEPOSIT to enter "Kill the Bit" program, click RUN, verify LEDs animate
6. Manual: Load Altair BASIC from software library, verify "MEMORY SIZE?" prompt in terminal, type response, run BASIC commands

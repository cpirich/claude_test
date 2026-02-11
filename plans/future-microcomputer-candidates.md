# Future Microcomputer Emulation Candidates

This document evaluates additional microcomputers for future emulation phases, based on documentation availability, test resources, software libraries, and technical diversity.

## Evaluation Criteria

1. **Documentation Quality** — Complete technical references, schematics, ROM disassemblies
2. **Test Resources** — CPU test suites, diagnostic ROMs, validation tools
3. **Software Availability** — Game and application libraries for testing
4. **Reference Emulators** — Existing open-source implementations to study
5. **Technical Diversity** — Different CPU, video, or I/O architectures
6. **Historical Significance** — Cultural impact and user base

---

## Phase 3: Apple II Plus (1979)

**Natural evolution from Apple I, well-documented 6502 platform**

### Technical Specifications

- **CPU**: MOS 6502 at 1.023 MHz (same as Apple I)
- **Memory**: 48K RAM standard (expandable to 64K)
- **Display**: 40×24 text, 280×192 hi-res graphics, 40×48 lo-res color graphics
- **I/O**: 8 expansion slots, disk controller, keyboard
- **ROM**: Applesoft BASIC and Monitor in ROM

### Why Apple II?

- **Continuity**: Shares 6502 CPU with Apple I, reuses existing CPU core
- **Graphics Evolution**: Introduces framebuffer graphics while maintaining text mode
- **Expansion Architecture**: Slot-based I/O teaches peripheral emulation
- **Software Library**: Massive collection of games and applications
- **Browser Compatibility**: Text and lo-res graphics can render in canvas/WebGL

### Test Resources

- **Klaus Dormann 6502 tests** — Already passing from Apple I implementation
- **Apple II Diagnostic disk images** — Available at [Applefritter](https://www.applefritter.com)
- **AppleWin test suite** — Reference emulator includes diagnostic tools
- **Extensive software library** — Thousands of disk images for integration testing

### Documentation

- **Apple II Reference Manual** — Complete hardware documentation (public domain)
- **Understanding the Apple II** — Detailed technical guide by Jim Sather
- **Applesoft BASIC ROM disassembly** — Fully annotated
- **Disk II controller documentation** — Well-documented 5.25" floppy interface

### Reference Emulators

- **[AppleWin](https://github.com/AppleWin/AppleWin)** — Windows emulator with extensive debugging tools
- **Apple2js** by Will Scullin — JavaScript/TypeScript browser implementation
- **MAME** — Includes Apple II driver
- **[Numerous resources](https://www.eiroca.net/wiki/archive/awesome/apple2)** — Active community maintains documentation

### Implementation Complexity

- **Medium** — More complex than Apple I but well-documented
- **Reuses**: 6502 CPU core from Apple I
- **New challenges**: Disk I/O, slot architecture, color graphics

---

## Phase 4: BBC Micro Model B (1981)

**Educational powerhouse with excellent documentation and test suites**

### Technical Specifications

- **CPU**: MOS 6502 at 2 MHz
- **Memory**: 32K RAM (Model B)
- **Display**: 80×32 or 40×25 text, multiple graphics modes up to 640×256
- **I/O**: Advanced video chip (6845 CRTC), sound (SN76489), user/printer/RS423 ports
- **ROM**: BBC BASIC, MOS (operating system)

### Why BBC Micro?

- **Exceptional Documentation**: Created for education, extensively documented
- **Test Infrastructure**: Multiple emulators include [Klaus Dormann's 6502 test suite](https://github.com/mattgodbolt/jsbeeb)
- **Active Community**: [jsbeeb](https://bbc.xania.org/) and [b2](https://github.com/tom-seddon/b2) provide modern reference implementations
- **Browser Compatibility**: Text modes work well in terminals, graphics use canvas
- **Unique Features**: Sophisticated video modes teach CRTC emulation

### Test Resources

- **Klaus Dormann 6502 tests** — jsbeeb includes complete test suite
- **jsbeeb test directory** — Comprehensive validation suite for all documented opcodes
- **b2 debugger** — Extensive debugging functionality and HTTP API
- **[BBC Computer Literacy Project](https://clp.bbcrewind.co.uk/beeb)** — 166 programs for integration testing

### Documentation

- **BBC Microcomputer System User Guide** — Complete official documentation
- **Advanced User Guide** — Technical details on hardware and OS
- **Service Manual** — Schematics and hardware reference
- **MOS and BASIC ROM listings** — Fully documented and available

### Reference Emulators

- **[jsbeeb](https://github.com/mattgodbolt/jsbeeb)** — JavaScript emulator with excellent documentation
- **[b2](https://github.com/tom-seddon/b2)** — Cross-platform with integrated debugger
- **[beebjit](https://github.com/scarybeasts/beebjit)** — Very fast, highly accurate
- **[B-EM](https://www.b-em.bbcmicro.com/)** — Open source for Windows/Linux

### Implementation Complexity

- **Medium-High** — More sophisticated than Apple II
- **Reuses**: 6502 CPU core
- **New challenges**: 6845 CRTC chip, sound, multiple video modes

---

## Phase 5: Commodore 64 (1982)

**Most popular home computer ever, extensive resources**

### Technical Specifications

- **CPU**: MOS 6510 (6502 variant) at 1.023 MHz
- **Memory**: 64K RAM, 20K ROM (BASIC, KERNAL, Character)
- **Display**: 40×25 text, 320×200 graphics, hardware sprites
- **Sound**: SID chip (3 voices, filters, envelope)
- **I/O**: VIC-II video chip, CIA I/O chips, cartridge port

### Why Commodore 64?

- **Ubiquity**: Best-selling single computer model (12-17 million units)
- **Massive Software Library**: Thousands of games and applications
- **Excellent Emulation Resources**: [VICE](https://vice-emu.sourceforge.io/) is gold standard
- **Test Suites**: [C64 Testers](https://commodore.software/downloads/category/148-c64-testers) category with diagnostic utilities
- **Complex Features**: SID audio and VIC-II sprites are challenging but rewarding

### Test Resources

- **VICE test suite** — Comprehensive hardware tests
- **C64 Tester utilities** — Multiple diagnostic programs available
- **Extensive game library** — Real-world integration testing
- **Active community** — Ongoing development and documentation

### Documentation

- **Commodore 64 Programmer's Reference Guide** — Complete technical manual
- **VIC-II documentation** — Well-documented video chip behavior
- **SID chip documentation** — Detailed audio chip specs
- **ROM disassemblies** — BASIC and KERNAL fully documented

### Reference Emulators

- **[VICE](https://vice-emu.sourceforge.io/)** — Most accurate C64 emulator, open source
- **[CCS64](https://www.ccs64.com/)** — Long-running emulator with excellent compatibility
- **JavaScript implementations** — Several browser-based emulators exist

### Implementation Complexity

- **High** — Most complex of the candidates
- **Reuses**: 6502 CPU core (minor 6510 additions)
- **New challenges**: VIC-II graphics, SID audio, sprites, complex timing

---

## Phase 6: ZX Spectrum (1982)

**British computing icon, Z80 architecture variant**

### Technical Specifications

- **CPU**: Zilog Z80A at 3.5 MHz
- **Memory**: 16K or 48K RAM (48K standard)
- **Display**: 256×192 pixels, 32×24 character cells, 15 colors
- **Sound**: Beeper (1-bit)
- **I/O**: Membrane keyboard, cassette interface

### Why ZX Spectrum?

- **Architectural Diversity**: Reuses Z80 from TRS-80 but different video system
- **Huge UK Software Library**: Massive collection of games and demos
- **Test Suites Available**: [zx-spec](https://github.com/rhargreaves/zx-spec) unit testing framework
- **Browser Rendering**: Attribute-based color system maps well to canvas
- **Historical Importance**: Defined UK home computing scene

### Test Resources

- **ZEXDOC/ZEXALL** — Already passing from TRS-80 Z80 implementation
- **[ZX Spectrum test suite](https://github.com/rhargreaves/zx-spec)** — Unit testing framework for assembly
- **[World of Spectrum](https://worldofspectrum.org/)** — Massive software archive
- **Multiple diagnostic utilities** — Community-developed test programs

### Documentation

- **ZX Spectrum Technical Manual** — Complete hardware reference
- **ROM disassemblies** — Fully documented BASIC and routines
- **ULA chip documentation** — Video and I/O chip well-understood
- **[World of Spectrum documentation](https://worldofspectrum.net/documentation/)** — Extensive community resources

### Reference Emulators

- **[Fuse](http://fuse-emulator.sourceforge.net/)** — Highly accurate emulator
- **[ZEsarUX](https://github.com/chernandezba/zesarux)** — Multi-machine emulator
- **[ESPectrum](https://github.com/EremusOne/ESPectrum)** — ESP32 implementation
- **[Spectral](https://github.com/r-lyeh/Spectral)** — Cross-platform emulator

### Implementation Complexity

- **Medium** — Simpler than C64, but unique video system
- **Reuses**: Z80 CPU core from TRS-80
- **New challenges**: ULA chip, attribute-based color, contended memory timing

---

## Phase 7: Atari 800 (1979)

**Advanced graphics and sound capabilities**

### Technical Specifications

- **CPU**: MOS 6502 at 1.79 MHz
- **Memory**: 8K-48K RAM, 10K ROM
- **Display**: ANTIC/GTIA chips, multiple graphics modes, hardware sprites
- **Sound**: POKEY chip (4 voices)
- **I/O**: Cartridge slots, joystick ports, SIO bus

### Why Atari 800?

- **Advanced Architecture**: ANTIC custom display chip offloads CPU
- **Test Suite**: [Acid800](https://www.virtualdub.org/altirra.html) stress tests emulators
- **Excellent Documentation**: [Altirra emulator](https://www.virtualdub.org/altirra.html) includes cycle-exact implementation
- **Unique Features**: Display list architecture teaches DMA concepts
- **Good Software Library**: Strong game library

### Test Resources

- **Acid800** — Comprehensive test suite for 8-bit Atari emulators
- **Klaus Dormann 6502 tests** — CPU validation (already passing)
- **[Atari800 emulator](https://atari800.github.io/)** — Reference implementation with test support
- **Software archives** — Large collection for integration testing

### Documentation

- **Altirra Hardware Reference** — Detailed technical documentation
- **ANTIC/GTIA chip specifications** — Well-documented custom chips
- **OS ROM listings** — Disassemblies available
- **De Re Atari** — Classic technical reference book

### Reference Emulators

- **[Altirra](https://www.virtualdub.org/altirra.html)** — Cycle-exact emulation, best-in-class accuracy
- **[Atari800](https://atari800.github.io/)** — Cross-platform open-source emulator
- **Multiple ports** — Available for many platforms

### Implementation Complexity

- **High** — Complex custom chips and DMA
- **Reuses**: 6502 CPU core
- **New challenges**: ANTIC display lists, GTIA graphics, POKEY audio, DMA timing

---

## Recommended Roadmap

### Phase 3: Apple II Plus
- **Timeline**: After Apple I and TRS-80 are stable
- **Rationale**: Natural progression, reuses 6502 core, well-documented
- **Focus**: Disk I/O, slot architecture, color graphics

### Phase 4: BBC Micro Model B
- **Timeline**: After Apple II
- **Rationale**: Exceptional documentation, active community, sophisticated video
- **Focus**: 6845 CRTC, multiple video modes, educational software

### Phase 5: Commodore 64
- **Timeline**: After BBC Micro
- **Rationale**: Most popular platform, VICE test suite, challenging but rewarding
- **Focus**: VIC-II graphics, SID audio, sprites, timing accuracy

### Phase 6: ZX Spectrum
- **Timeline**: After C64
- **Rationale**: Reuses Z80 core, different video approach, huge UK software library
- **Focus**: ULA chip, attribute-based color, contended memory

### Phase 7: Atari 800
- **Timeline**: Long-term goal
- **Rationale**: Advanced architecture, teaches DMA concepts
- **Focus**: ANTIC/GTIA chips, display lists, POKEY audio

---

## Candidates Not Recommended (At This Time)

### Commodore VIC-20
- **Reason**: Too similar to C64, less interesting architecturally
- **Better Alternative**: Go straight to C64 for greater impact

### Commodore PET 2001
- **Reason**: Rejected in original plan — complex CRTC chip, less software than other candidates
- **Alternative**: BBC Micro offers similar 6502 + CRTC combination with better resources

### Apple III
- **Reason**: Poor documentation, hardware reliability issues, limited software
- **Alternative**: Apple II offers better return on effort

### Tandy Color Computer (CoCo)
- **Reason**: 6809 CPU would require new core, less documentation than alternatives
- **Interest**: Could revisit if 6809 emulation becomes a goal

---

## Implementation Strategy

### Reuse CPU Cores
- **6502 machines** (Apple II, BBC Micro, Atari 800) reuse existing core
- **Z80 machines** (ZX Spectrum) reuse existing core
- Only C64's 6510 needs minor 6502 modifications

### Progressive Complexity
1. Start with text-based terminals (✓ Apple I, ✓ TRS-80)
2. Add framebuffer graphics (Apple II, BBC Micro)
3. Introduce hardware sprites (C64, Atari 800)
4. Implement sound chips (C64, Atari 800)

### Test-Driven Development
- All candidates have established test suites
- CPU tests already passing for 6502 and Z80
- Platform-specific tests validate hardware emulation

---

## Sources

- [VICE - Versatile Commodore Emulator](https://vice-emu.sourceforge.io/)
- [C64 Testers Software Archive](https://commodore.software/downloads/category/148-c64-testers)
- [AppleWin - Apple II Emulator](https://github.com/AppleWin/AppleWin)
- [Awesome Apple 2 Resources](https://www.eiroca.net/wiki/archive/awesome/apple2)
- [jsbeeb - JavaScript BBC Micro Emulator](https://github.com/mattgodbolt/jsbeeb)
- [b2 - BBC Micro Emulator](https://github.com/tom-seddon/b2)
- [BBC Computer Literacy Project](https://clp.bbcrewind.co.uk/beeb)
- [World of Spectrum](https://worldofspectrum.org/)
- [ZX Spectrum Test Framework](https://github.com/rhargreaves/zx-spec)
- [Altirra - Atari 8-bit Emulator](https://www.virtualdub.org/altirra.html)
- [Atari800 Emulator](https://atari800.github.io/)
- [Emulation General Wiki](https://emulation.gametechwiki.com/)

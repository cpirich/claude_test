"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { TRS80System } from "@/emulator/trs80/system";
import { TRS80_STUB_ROM } from "@/emulator/trs80/roms/level2-basic-stub";
import type { TRS80Key } from "@/emulator/trs80/keyboard";
import { VIDEO_COLS, VIDEO_ROWS } from "@/emulator/trs80/video";
import type { SoftwareEntry } from "@/emulator/apple1/software-library";

/** Cycles per video frame at 1.774 MHz / 60 fps. */
const CYCLES_PER_FRAME = Math.round(1_774_000 / 60);

export interface Trs80State {
  lines: string[];
  cursorCol: number;
  cursorRow: number;
  currentSoftware: string | null;
}

/**
 * Characters that need synthetic SHIFT on the TRS-80 but arrive unshifted
 * from a modern keyboard. Maps browser key → TRS-80 base key.
 * The caller must also press/release SHIFT in the emulator.
 */
const SYNTHETIC_SHIFT: Record<string, TRS80Key> = {
  '=': '-',   // = is SHIFT+- on TRS-80
  "'": '7',   // ' is SHIFT+7 on TRS-80
};

/**
 * Map browser key events to TRS-80 key identifiers.
 * Returns [keyDown, keyUp] pairs since the TRS-80 uses press/release.
 */
function mapKeyToTRS80(e: KeyboardEvent): TRS80Key | null {
  // Letters A-Z
  if (e.key.length === 1) {
    const upper = e.key.toUpperCase();
    if (upper >= "A" && upper <= "Z") return upper as TRS80Key;
    if (upper >= "0" && upper <= "9") return upper as TRS80Key;
    // Punctuation mapped to TRS-80 keys
    switch (upper) {
      case "@": return "@";
      case ":": return ":";
      case ";": return ";";
      case ",": return ",";
      case "-": return "-";
      case ".": return ".";
      case "/": return "/";
      case " ": return "SPACE";
      case "*": return ":";
    }
  }

  // Special keys
  switch (e.key) {
    case "Enter": return "ENTER";
    case "Backspace": return "LEFT";
    case "ArrowUp": return "UP";
    case "ArrowDown": return "DOWN";
    case "ArrowLeft": return "LEFT";
    case "ArrowRight": return "RIGHT";
    case "Escape": return "BREAK";
    case "Shift": return "SHIFT";
    case "Tab": return "CLEAR";
  }

  return null;
}

/**
 * React hook that manages a TRS-80 Model I emulator instance.
 *
 * - Creates and resets the emulator on mount, loading the stub ROM
 * - Runs the CPU execution loop via requestAnimationFrame
 * - Syncs video RAM state into React on each frame
 * - Returns keyDown/keyUp handlers for wiring to keyboard events
 */
export function useTrs80() {
  const emulatorRef = useRef<TRS80System | null>(null);
  const rafRef = useRef<number>(0);
  const [state, setState] = useState<Trs80State>({
    lines: Array(VIDEO_ROWS).fill(" ".repeat(VIDEO_COLS)),
    cursorCol: 0,
    cursorRow: 0,
    currentSoftware: null,
  });

  // Initialize emulator once
  useEffect(() => {
    const emu = new TRS80System();
    emulatorRef.current = emu;
    emu.loadROM(TRS80_STUB_ROM);
    emu.reset();

    // Execution loop — runs CPU cycles each animation frame, then syncs display
    let running = true;
    const tick = () => {
      if (!running) return;
      emu.run(CYCLES_PER_FRAME);

      // Read video RAM as lines for display
      const lines: string[] = [];
      for (let row = 0; row < VIDEO_ROWS; row++) {
        lines.push(emu.video.getRow(row));
      }

      // Derive cursor position: try ROM cursor pointer at $4000 first,
      // fall back to last video write position (works for any ROM)
      const cursorAddr = emu.memory.read(0x4000) | (emu.memory.read(0x4001) << 8);
      const offset = cursorAddr - 0x3c00;
      const cursorRow = Math.floor(offset / VIDEO_COLS);
      const cursorCol = offset % VIDEO_COLS;

      const validCursor = cursorRow >= 0 && cursorRow < VIDEO_ROWS
        && cursorCol >= 0 && cursorCol < VIDEO_COLS;

      let finalRow: number;
      let finalCol: number;

      if (validCursor) {
        finalRow = cursorRow;
        finalCol = cursorCol;
      } else {
        // Fallback: use last video write position (ROM-independent)
        const pos = emu.video.getLastWritePosition();
        finalRow = pos.row;
        finalCol = pos.col;
      }

      setState((prev) => ({
        ...prev,
        lines,
        cursorCol: finalCol,
        cursorRow: finalRow,
      }));

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
      emulatorRef.current = null;
    };
  }, []);

  /** Handle keydown — press key in emulator. */
  const onKeyDown = useCallback((e: KeyboardEvent) => {
    const emu = emulatorRef.current;
    if (!emu) return;

    if (e.ctrlKey || e.metaKey || e.altKey) return;

    // Characters that need synthetic SHIFT on TRS-80 but are unshifted on modern keyboards
    const synthKey = SYNTHETIC_SHIFT[e.key];
    if (synthKey) {
      e.preventDefault();
      emu.keyDown('SHIFT');
      emu.keyDown(synthKey);
      return;
    }

    const trsKey = mapKeyToTRS80(e);
    if (trsKey) {
      e.preventDefault();
      emu.keyDown(trsKey);
    }
  }, []);

  /** Handle keyup — release key in emulator. */
  const onKeyUp = useCallback((e: KeyboardEvent) => {
    const emu = emulatorRef.current;
    if (!emu) return;

    // Release synthetic SHIFT for characters that needed it on keyDown
    const synthKey = SYNTHETIC_SHIFT[e.key];
    if (synthKey) {
      emu.keyUp(synthKey);
      emu.keyUp('SHIFT');
      return;
    }

    const trsKey = mapKeyToTRS80(e);
    if (trsKey) {
      emu.keyUp(trsKey);
    }
  }, []);

  /** Reset the emulator (cold boot) — restores the default stub ROM. */
  const reset = useCallback(() => {
    const emu = emulatorRef.current;
    if (!emu) return;
    emu.loadROM(TRS80_STUB_ROM);
    emu.reset();
    setState((prev) => ({ ...prev, currentSoftware: null }));
  }, []);

  /** Type a command string into the terminal and submit with ENTER. */
  const typeCommand = useCallback((text: string) => {
    const emu = emulatorRef.current;
    if (!emu) return;

    // Map ASCII char to TRS-80 key(s). Returns [key, needsShift].
    const charToKey = (ch: string): [TRS80Key, boolean] | null => {
      const upper = ch.toUpperCase();
      if (upper >= 'A' && upper <= 'Z') return [upper as TRS80Key, false];
      if (upper >= '0' && upper <= '9') return [upper as TRS80Key, false];
      if (ch === ' ') return ['SPACE', false];
      // Unshifted punctuation
      const unshifted: Record<string, TRS80Key> = {
        ':': ':', ';': ';', ',': ',', '-': '-', '.': '.', '/': '/', '@': '@',
      };
      if (unshifted[ch]) return [unshifted[ch], false];
      // Shifted characters (TRS-80 SHIFT + number row)
      const shifted: Record<string, TRS80Key> = {
        '!': '1', '"': '2', '#': '3', '$': '4', '%': '5',
        '&': '6', "'": '7', '(': '8', ')': '9', '*': ':',
        '+': ';', '<': ',', '=': '-', '>': '.', '?': '/',
      };
      if (shifted[ch]) return [shifted[ch], true];
      return null;
    };

    const chars = [...text.split(''), 'ENTER'];
    let i = 0;
    const interval = setInterval(() => {
      if (i >= chars.length || !emulatorRef.current) {
        clearInterval(interval);
        return;
      }
      const ch = chars[i];
      if (ch === 'ENTER') {
        emulatorRef.current.keyDown('ENTER');
        setTimeout(() => emulatorRef.current?.keyUp('ENTER'), 15);
      } else {
        const mapped = charToKey(ch);
        if (mapped) {
          const [key, shift] = mapped;
          if (shift) {
            emulatorRef.current.keyDown('SHIFT');
            // Delay character key so keyboard matrix registers SHIFT first
            setTimeout(() => {
              emulatorRef.current?.keyDown(key);
              setTimeout(() => {
                emulatorRef.current?.keyUp(key);
                emulatorRef.current?.keyUp('SHIFT');
              }, 15);
            }, 20);
          } else {
            emulatorRef.current.keyDown(key);
            setTimeout(() => {
              emulatorRef.current?.keyUp(key);
            }, 15);
          }
        }
      }
      i++;
    }, 50);
  }, []);

  /** Load a software entry into memory. */
  const loadSoftware = useCallback((entry: SoftwareEntry) => {
    const emu = emulatorRef.current;
    if (!emu) return;

    // Handle textMode BAS files by typing the listing instead of loading binary
    if (entry.textMode && entry.listing) {
      typeCommand(entry.listing);
      setState((prev) => ({ ...prev, currentSoftware: entry.id }));
    } else {
      emu.loadSoftware(entry);
      setState((prev) => ({ ...prev, currentSoftware: entry.id }));
    }
  }, [typeCommand]);

  return { state, onKeyDown, onKeyUp, reset, loadSoftware, typeCommand, emulator: emulatorRef };
}

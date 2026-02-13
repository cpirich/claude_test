"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { Apple1 } from "@/emulator/apple1/apple1";
import type { SoftwareEntry } from "@/emulator/apple1/software-library";

export interface Apple1State {
  lines: string[];
  cursorCol: number;
  cursorRow: number;
  currentSoftware: string | null;
}

/**
 * React hook that manages an Apple I emulator instance.
 *
 * - Creates and resets the emulator on mount
 * - Runs the CPU execution loop via requestAnimationFrame
 * - Syncs terminal state into React on each frame
 * - Returns a keyPress handler for wiring to keyboard events
 */
export function useApple1() {
  const emulatorRef = useRef<Apple1 | null>(null);
  const rafRef = useRef<number>(0);
  const [state, setState] = useState<Apple1State>({
    lines: [],
    cursorCol: 0,
    cursorRow: 0,
    currentSoftware: null,
  });

  // Initialize emulator once
  useEffect(() => {
    const emu = new Apple1();
    emulatorRef.current = emu;
    emu.reset();

    // Sync initial terminal state
    const cursor = emu.getCursor();
    setState((prev) => ({
      ...prev,
      lines: emu.getTerminalLines(),
      cursorCol: cursor.col,
      cursorRow: cursor.row,
    }));

    // Execution loop — runs CPU cycles each animation frame, then syncs display
    let running = true;
    const tick = () => {
      if (!running) return;
      emu.runFrame();
      const c = emu.getCursor();
      setState((prev) => ({
        ...prev,
        lines: emu.getTerminalLines(),
        cursorCol: c.col,
        cursorRow: c.row,
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

  /**
   * Feed a keyboard event into the emulator.
   * Maps browser key events to Apple I ASCII.
   */
  const keyPress = useCallback((e: React.KeyboardEvent | KeyboardEvent) => {
    const emu = emulatorRef.current;
    if (!emu) return;

    // Ignore modifier-only keys and browser shortcuts
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    let ascii: number | null = null;

    if (e.key === "Enter") {
      ascii = 0x0d; // CR
    } else if (e.key === "Escape") {
      // ESC sends $9B on Apple I (handled by Woz Monitor as reset-line)
      ascii = 0x1b;
    } else if (e.key.length === 1) {
      const code = e.key.charCodeAt(0);
      // Convert to uppercase — Apple I only has uppercase
      if (code >= 0x61 && code <= 0x7a) {
        ascii = code - 0x20; // lowercase → uppercase
      } else if (code >= 0x20 && code <= 0x5f) {
        ascii = code; // printable range the Apple I supports
      }
    }

    if (ascii !== null) {
      e.preventDefault();
      emu.keyPress(ascii);
    }
  }, []);

  /** Reset the emulator (cold boot). */
  const reset = useCallback(() => {
    const emu = emulatorRef.current;
    if (!emu) return;
    emu.reset();
  }, []);

  /** Load a software entry into memory. */
  const loadSoftware = useCallback((entry: SoftwareEntry) => {
    const emu = emulatorRef.current;
    if (!emu) return;
    emu.loadSoftware(entry);
    setState((prev) => ({ ...prev, currentSoftware: entry.id }));
  }, []);

  /** Type a command string into the terminal and submit with CR. */
  const typeCommand = useCallback((text: string) => {
    const emu = emulatorRef.current;
    if (!emu) return;

    const upper = text.toUpperCase();
    const queue = [...upper.split('').map((ch) => ch.charCodeAt(0)), 0x0d];
    let i = 0;
    const interval = setInterval(() => {
      if (i >= queue.length || !emulatorRef.current) {
        clearInterval(interval);
        return;
      }
      const code = queue[i];
      if ((code >= 0x20 && code <= 0x5f) || code === 0x0d) {
        emulatorRef.current.keyPress(code);
      }
      i++;
    }, 25);
  }, []);

  return { state, keyPress, reset, loadSoftware, typeCommand, emulator: emulatorRef };
}

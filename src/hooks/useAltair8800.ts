"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { Altair8800System } from "@/emulator/altair8800/system";
import type { SoftwareEntry } from "@/emulator/apple1/software-library";
import type { Altair8800PanelState, PanelAction } from "@/components/Altair8800Panel";
import {
  ALTAIR_SOFTWARE_CATALOG,
} from "@/emulator/altair8800/software-catalog";

/** Cycles per video frame at 2 MHz / 60 fps. */
const CYCLES_PER_FRAME = Math.round(2_000_000 / 60);

/** Serial terminal dimensions. */
const TERM_COLS = 80;
const TERM_ROWS = 24;

export interface Altair8800State {
  lines: string[];
  cursorCol: number;
  cursorRow: number;
  currentSoftware: string | null;
}

/**
 * React hook that manages an Altair 8800 emulator instance.
 *
 * - Creates the system on mount with turnkey boot ROM
 * - Runs the CPU execution loop via requestAnimationFrame
 * - Manages serial terminal output buffer
 * - Exposes front panel state and actions
 */
export function useAltair8800() {
  const emulatorRef = useRef<Altair8800System | null>(null);
  const rafRef = useRef<number>(0);

  // Terminal state (serial output buffer)
  const termLinesRef = useRef<string[]>(Array(TERM_ROWS).fill(" ".repeat(TERM_COLS)));
  const cursorColRef = useRef(0);
  const cursorRowRef = useRef(0);

  const [state, setState] = useState<Altair8800State>({
    lines: Array(TERM_ROWS).fill(" ".repeat(TERM_COLS)),
    cursorCol: 0,
    cursorRow: 0,
    currentSoftware: null,
  });

  const [panelState, setPanelState] = useState<Altair8800PanelState>({
    addressSwitches: 0,
    dataSwitches: 0,
    addressLEDs: 0,
    dataLEDs: 0,
    statusLEDs: 0,
    running: false,
  });

  // Initialize emulator once
  useEffect(() => {
    const emu = new Altair8800System();
    emulatorRef.current = emu;

    // Set up serial output callback — writes characters to our terminal buffer
    emu.setSerialOutputCallback((char: number) => {
      const lines = termLinesRef.current;
      let col = cursorColRef.current;
      let row = cursorRowRef.current;

      if (char === 0x0d) {
        // CR — move to start of line
        col = 0;
      } else if (char === 0x0a) {
        // LF — move down one line
        row++;
        if (row >= TERM_ROWS) {
          // Scroll up
          lines.shift();
          lines.push(" ".repeat(TERM_COLS));
          row = TERM_ROWS - 1;
        }
      } else if (char === 0x08 || char === 0x7f) {
        // BS / DEL — move cursor left
        if (col > 0) col--;
      } else if (char >= 0x20 && char < 0x7f) {
        // Printable character
        const line = lines[row];
        lines[row] = line.substring(0, col) + String.fromCharCode(char) + line.substring(col + 1);
        col++;
        if (col >= TERM_COLS) {
          col = 0;
          row++;
          if (row >= TERM_ROWS) {
            lines.shift();
            lines.push(" ".repeat(TERM_COLS));
            row = TERM_ROWS - 1;
          }
        }
      }

      cursorColRef.current = col;
      cursorRowRef.current = row;
    });

    // Load turnkey boot ROM by default
    const turnkey = ALTAIR_SOFTWARE_CATALOG.find((e) => e.id === "altair-turnkey-boot");
    if (turnkey) {
      emu.loadSoftware(turnkey);
      emu.panel.run();
    }

    // Execution loop
    let running = true;
    const tick = () => {
      if (!running) return;
      emu.run(CYCLES_PER_FRAME);

      // Sync panel state
      const ps = emu.panel.getState();
      setPanelState(ps);

      // Sync terminal state
      setState((prev) => ({
        ...prev,
        lines: [...termLinesRef.current],
        cursorCol: cursorColRef.current,
        cursorRow: cursorRowRef.current,
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

  /** Handle keyboard input — sends to serial port. */
  const onKeyDown = useCallback((e: KeyboardEvent) => {
    const emu = emulatorRef.current;
    if (!emu) return;

    if (e.ctrlKey || e.metaKey || e.altKey) return;

    let ascii: number | null = null;

    if (e.key === "Enter") {
      ascii = 0x0d;
    } else if (e.key === "Backspace") {
      ascii = 0x08;
    } else if (e.key === "Escape") {
      ascii = 0x1b;
    } else if (e.key.length === 1) {
      ascii = e.key.charCodeAt(0);
    }

    if (ascii !== null) {
      e.preventDefault();
      emu.serialInput(ascii);
    }
  }, []);

  /** Reset the emulator — clears terminal and reloads turnkey boot. */
  const reset = useCallback(() => {
    const emu = emulatorRef.current;
    if (!emu) return;

    // Clear terminal buffer
    termLinesRef.current = Array(TERM_ROWS).fill(" ".repeat(TERM_COLS));
    cursorColRef.current = 0;
    cursorRowRef.current = 0;

    emu.reset();
    emu.memory.clear();

    // Reload turnkey boot ROM
    const turnkey = ALTAIR_SOFTWARE_CATALOG.find((e) => e.id === "altair-turnkey-boot");
    if (turnkey) {
      emu.loadSoftware(turnkey);
      emu.panel.run();
    }

    setState((prev) => ({ ...prev, currentSoftware: null }));
  }, []);

  /** Load a software entry into memory. */
  const loadSoftware = useCallback((entry: SoftwareEntry) => {
    const emu = emulatorRef.current;
    if (!emu) return;

    // Clear terminal for fresh output
    termLinesRef.current = Array(TERM_ROWS).fill(" ".repeat(TERM_COLS));
    cursorColRef.current = 0;
    cursorRowRef.current = 0;

    emu.reset();
    emu.memory.clear();
    emu.loadSoftware(entry);

    // Auto-start if it has an entry point
    if (entry.entryPoint !== undefined) {
      emu.panel.run();
    }

    setState((prev) => ({ ...prev, currentSoftware: entry.id }));
  }, []);

  /** Type a command string into the serial terminal. */
  const typeCommand = useCallback((text: string) => {
    const emu = emulatorRef.current;
    if (!emu) return;

    const queue = [...text.split("").map((ch) => ch.charCodeAt(0)), 0x0d];
    let i = 0;
    const interval = setInterval(() => {
      if (i >= queue.length || !emulatorRef.current) {
        clearInterval(interval);
        return;
      }
      emulatorRef.current.serialInput(queue[i]);
      i++;
    }, 25);
  }, []);

  /** Dispatch a front panel action. */
  const panelAction = useCallback((action: PanelAction) => {
    const emu = emulatorRef.current;
    if (!emu) return;

    switch (action) {
      case "examine":
        emu.panel.examine();
        break;
      case "examineNext":
        emu.panel.examineNext();
        break;
      case "deposit":
        emu.panel.deposit();
        break;
      case "depositNext":
        emu.panel.depositNext();
        break;
      case "run":
        emu.panel.run();
        break;
      case "stop":
        emu.panel.stop();
        break;
      case "singleStep":
        emu.panel.singleStep();
        break;
      case "reset":
        emu.panel.reset();
        break;
      case "clr":
        // CLR clears the address/data switches
        emu.panel.addressSwitches = 0;
        emu.panel.dataSwitches = 0;
        break;
    }

    // Update panel state immediately
    setPanelState(emu.panel.getState());
  }, []);

  /** Toggle an address switch bit. */
  const toggleAddressSwitch = useCallback((bit: number) => {
    const emu = emulatorRef.current;
    if (!emu) return;
    emu.panel.toggleAddressSwitch(bit);
    setPanelState(emu.panel.getState());
  }, []);

  /** Toggle a data switch bit. */
  const toggleDataSwitch = useCallback((bit: number) => {
    const emu = emulatorRef.current;
    if (!emu) return;
    emu.panel.toggleDataSwitch(bit);
    setPanelState(emu.panel.getState());
  }, []);

  return {
    state,
    panelState,
    onKeyDown,
    reset,
    loadSoftware,
    typeCommand,
    panelAction,
    toggleAddressSwitch,
    toggleDataSwitch,
    emulator: emulatorRef,
  };
}

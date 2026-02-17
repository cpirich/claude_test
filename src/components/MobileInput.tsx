"use client";

import { useRef, useEffect, useCallback, useState } from "react";

type Machine = "apple1" | "trs80" | "altair8800";

interface MobileInputProps {
  machine: Machine;
  getContainer: () => HTMLElement | null;
  disabled?: boolean;
}

/** Special keys shown in the toolbar, varying by machine. */
const SPECIAL_KEYS: Record<Machine, { label: string; key: string; code?: string }[]> = {
  apple1: [
    { label: "ESC", key: "Escape" },
    { label: "TAB", key: "Tab" },
    { label: "CTRL", key: "Control" },
  ],
  trs80: [
    { label: "ESC", key: "Escape" },
    { label: "BREAK", key: "Pause" },
    { label: "CLEAR", key: "Clear" },
    { label: "\u2190", key: "ArrowLeft" },
    { label: "\u2192", key: "ArrowRight" },
    { label: "\u2191", key: "ArrowUp" },
    { label: "\u2193", key: "ArrowDown" },
    { label: "TAB", key: "Tab" },
    { label: "CTRL", key: "Control" },
  ],
  altair8800: [
    { label: "ESC", key: "Escape" },
    { label: "TAB", key: "Tab" },
    { label: "CTRL", key: "Control" },
  ],
};

/**
 * Hidden input field for mobile native keyboard input + special-key toolbar.
 *
 * Uses the phone's native keyboard via a hidden <input>. Character input flows
 * through beforeinput/input events, gets converted to synthetic KeyboardEvent
 * dispatches on the terminal container. Special keys (ESC, arrows, BREAK, etc.)
 * are provided via a toolbar row.
 */
export function MobileInput({ machine, getContainer, disabled }: MobileInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [ctrlActive, setCtrlActive] = useState(false);
  const ctrlActiveRef = useRef(false);

  // Keep ref in sync with state
  useEffect(() => {
    ctrlActiveRef.current = ctrlActive;
  }, [ctrlActive]);

  // Focus the hidden input on mount
  useEffect(() => {
    if (disabled) return;
    const timer = setTimeout(() => {
      inputRef.current?.focus({ preventScroll: true });
    }, 100);
    return () => clearTimeout(timer);
  }, [disabled]);

  const dispatchKey = useCallback(
    (key: string, opts?: { code?: string }) => {
      const container = getContainer();
      if (!container) return;

      const ctrlKey = ctrlActiveRef.current;

      container.dispatchEvent(
        new KeyboardEvent("keydown", {
          key,
          code: opts?.code ?? key,
          bubbles: true,
          ctrlKey,
        })
      );

      // TRS-80 needs keyup events too
      if (machine === "trs80") {
        setTimeout(() => {
          container.dispatchEvent(
            new KeyboardEvent("keyup", {
              key,
              code: opts?.code ?? key,
              bubbles: true,
              ctrlKey,
            })
          );
        }, 80);
      }

      // Auto-deactivate CTRL after one keypress
      if (ctrlActiveRef.current) {
        setCtrlActive(false);
      }
    },
    [getContainer, machine]
  );

  const handleBeforeInput = useCallback(
    (e: React.SyntheticEvent<HTMLInputElement>) => {
      const nativeEvent = e.nativeEvent as InputEvent;

      if (nativeEvent.inputType === "insertLineBreak" || nativeEvent.inputType === "insertParagraph") {
        e.preventDefault();
        dispatchKey("Enter", { code: "Enter" });
        return;
      }

      if (nativeEvent.inputType === "deleteContentBackward") {
        e.preventDefault();
        dispatchKey("Backspace", { code: "Backspace" });
        return;
      }

      if (nativeEvent.inputType === "insertText" && nativeEvent.data) {
        e.preventDefault();
        const chars = nativeEvent.data;
        for (const char of chars) {
          dispatchKey(char);
        }
        return;
      }
    },
    [dispatchKey]
  );

  const handleSpecialKey = useCallback(
    (key: string, code?: string) => {
      if (key === "Control") {
        setCtrlActive((v) => !v);
        return;
      }

      dispatchKey(key, { code });

      // Re-focus hidden input
      setTimeout(() => {
        inputRef.current?.focus({ preventScroll: true });
      }, 10);
    },
    [dispatchKey]
  );

  const refocusInput = useCallback(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  const specialKeys = SPECIAL_KEYS[machine];

  return (
    <>
      {/* Hidden input for native keyboard */}
      <input
        ref={inputRef}
        className="mobile-hidden-input"
        type="text"
        autoCapitalize={machine === "apple1" ? "characters" : "none"}
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="send"
        onBeforeInput={handleBeforeInput}
        onInput={(e) => {
          // Clear input after any content arrives (belt & suspenders with beforeinput)
          const target = e.target as HTMLInputElement;
          if (target.value) {
            target.value = "";
          }
        }}
        onBlur={() => {
          // Re-focus if blurred unintentionally (not during overlay)
          if (!disabled) {
            setTimeout(() => {
              inputRef.current?.focus({ preventScroll: true });
            }, 100);
          }
        }}
      />

      {/* Special-key toolbar */}
      <div
        className="mobile-special-keys"
        onClick={refocusInput}
      >
        {specialKeys.map(({ label, key, code }) => (
          <button
            key={label}
            className={`mobile-special-key ${key === "Control" && ctrlActive ? "mobile-special-key-active" : ""}`}
            onTouchStart={(e) => {
              e.preventDefault();
              handleSpecialKey(key, code);
            }}
            onMouseDown={(e) => {
              e.preventDefault();
              handleSpecialKey(key, code);
            }}
          >
            {label}
          </button>
        ))}
      </div>
    </>
  );
}

/**
 * Hook to manage visualViewport keyboard detection.
 * Returns the current keyboard height in pixels.
 */
export function useKeyboardHeight(): number {
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const onResize = () => {
      // visualViewport.height shrinks when keyboard appears
      const kbHeight = Math.max(0, window.innerHeight - vv.height);
      setKeyboardHeight(kbHeight);
    };

    vv.addEventListener("resize", onResize);
    vv.addEventListener("scroll", onResize);
    // Initial check
    onResize();

    return () => {
      vv.removeEventListener("resize", onResize);
      vv.removeEventListener("scroll", onResize);
    };
  }, []);

  return keyboardHeight;
}

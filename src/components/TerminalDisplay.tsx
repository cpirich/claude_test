"use client";

import { useRef, useEffect, useState, useCallback, useImperativeHandle, type CSSProperties, type ReactNode } from "react";
import { useApple1 } from "@/hooks/useApple1";
import { useTrs80 } from "@/hooks/useTrs80";
import { useAltair8800 } from "@/hooks/useAltair8800";
import { SoftwareLibraryModal } from "./SoftwareLibraryModal";
import { Altair8800Panel } from "./Altair8800Panel";
import { getFullCatalog } from "@/emulator/apple1/software-catalog";
import { getTrs80FullCatalog } from "@/emulator/trs80/software-catalog";
import { getAltairFullCatalog } from "@/emulator/altair8800/software-catalog";
import type { SoftwareEntry } from "@/emulator/apple1/software-library";

/**
 * Pre-computed CSS styles for TRS-80 2×3 block semigraphics (codes $80-$BF).
 * Each character has 6 pixel blocks in a 2×3 grid controlled by bits 0-5:
 *   bit0=TL, bit1=TR, bit2=ML, bit3=MR, bit4=BL, bit5=BR
 * Rendered via CSS background gradients on inline-block spans.
 */
const SEMIGFX_STYLES: (CSSProperties | null)[] = (() => {
  const styles: (CSSProperties | null)[] = new Array(64);
  for (let bits = 0; bits < 64; bits++) {
    if (bits === 0) { styles[bits] = null; continue; }
    const layers: string[] = [];
    for (let b = 0; b < 6; b++) {
      if (bits & (1 << b)) {
        // CSS background-position percentages are relative to (container - image) size,
        // not absolute offsets. For a 50%-wide image: 0% → left edge, 100% → right edge.
        // For a 34%-tall image: 0% → top, 50% → middle (actual 33%), 100% → bottom (actual 66%).
        const x = b & 1 ? '100%' : '0%';
        const y = ['0%', '50%', '100%'][b >> 1];
        layers.push(`linear-gradient(currentColor,currentColor) ${x} ${y}/50% 34% no-repeat`);
      }
    }
    styles[bits] = { background: layers.join(',') };
  }
  return styles;
})();

/**
 * Render a TRS-80 display row, handling 2×3 block semigraphics as CSS spans.
 * Text-only rows return a plain string (fast path). Rows with semigraphics
 * (codes $80-$BF) return React elements with per-character rendering.
 */
function renderTrs80Row(
  codes: number[],
  displayLine: string,
  isCursorRow: boolean,
  cursorCol: number,
  cursorVisible: boolean,
  showCursor: boolean,
): ReactNode {
  const hasSemigfx = codes.some(c => c >= 0x80 && c <= 0xBF);

  // Fast path: no semigraphics, use plain text rendering
  if (!hasSemigfx) {
    if (isCursorRow && showCursor) {
      return (
        <>
          {displayLine.substring(0, cursorCol)}
          {cursorVisible ? (
            <span className="trs80-cursor bg-white text-terminal-bg">
              {displayLine.charAt(cursorCol) || " "}
            </span>
          ) : (
            <span className="trs80-cursor">{displayLine.charAt(cursorCol) || " "}</span>
          )}
          {displayLine.substring(cursorCol + 1)}
        </>
      );
    }
    return displayLine;
  }

  // Semigraphic path: render character by character, grouping text runs
  const elements: ReactNode[] = [];
  let textRun = '';

  const flushText = () => {
    if (textRun) {
      elements.push(textRun);
      textRun = '';
    }
  };

  for (let col = 0; col < codes.length; col++) {
    const code = codes[col];
    const isCursorPos = isCursorRow && showCursor && col === cursorCol;

    if (code >= 0x80 && code <= 0xBF) {
      flushText();
      const bits = code & 0x3F;
      if (isCursorPos && cursorVisible) {
        elements.push(<span key={col} className="trs80-cursor bg-white text-terminal-bg">{' '}</span>);
      } else if (bits === 0) {
        // Empty semigraphic = space
        textRun += ' ';
      } else {
        elements.push(<span key={col} className="trs80-semigfx" style={SEMIGFX_STYLES[bits]!} />);
      }
    } else {
      // Regular text character
      if (isCursorPos) {
        flushText();
        const ch = displayLine.charAt(col) || ' ';
        elements.push(
          cursorVisible
            ? <span key={col} className="trs80-cursor bg-white text-terminal-bg">{ch}</span>
            : <span key={col} className="trs80-cursor">{ch}</span>
        );
      } else {
        textRun += displayLine.charAt(col);
      }
    }
  }
  flushText();

  return <>{elements}</>;
}

export interface TerminalHandle {
  typeCommand: (cmd: string) => void;
}

interface TerminalDisplayProps {
  machine: "apple1" | "trs80" | "altair8800";
  terminalRef?: React.RefObject<TerminalHandle | null>;
  onSoftwareLoad?: (softwareId: string) => void;
}

const TERMINAL_COLS: Record<string, number> = {
  apple1: 40,
  trs80: 64,
  altair8800: 80,
};

const TERMINAL_ROWS: Record<string, number> = {
  apple1: 24,
  trs80: 16,
  altair8800: 24,
};

function LoadToast({ entry, onDismiss }: { entry: SoftwareEntry; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 5000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  const addr = entry.entryPoint.toString(16).toUpperCase().padStart(4, "0");

  return (
    <div
      className="absolute bottom-2 left-2 right-2 border border-terminal-green bg-terminal-bg/95 px-3 py-2 font-mono text-xs z-10 cursor-pointer"
      onClick={onDismiss}
    >
      <div className="text-terminal-green font-bold">
        LOADED: {entry.name}
      </div>
      <div className="text-terminal-border mt-0.5">
        {entry.addressRange} &mdash; ENTRY: ${addr}
      </div>
      {entry.loadInstructions && (
        <div className="text-terminal-green/80 mt-1">
          {entry.loadInstructions}
        </div>
      )}
    </div>
  );
}

function Apple1Terminal({ terminalHandleRef, onSoftwareLoad }: { terminalHandleRef?: React.RefObject<TerminalHandle | null>; onSoftwareLoad?: (id: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const [cursorVisible, setCursorVisible] = useState(true);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [loadedEntry, setLoadedEntry] = useState<SoftwareEntry | null>(null);
  const [softwareName, setSoftwareName] = useState("Woz Monitor");
  const [termScale, setTermScale] = useState({ x: 1, y: 1 });

  const { state, keyPress, reset, loadSoftware, typeCommand } = useApple1();

  // Expose typeCommand via ref
  useImperativeHandle(terminalHandleRef, () => ({ typeCommand }), [typeCommand]);
  const { lines, cursorRow, cursorCol } = state;
  const cols = TERMINAL_COLS.apple1;
  const rows = TERMINAL_ROWS.apple1;

  // Cursor blink
  useEffect(() => {
    const interval = setInterval(() => setCursorVisible((v) => !v), 530);
    return () => clearInterval(interval);
  }, []);

  // Capture keyboard events on the container div (no hidden input needed)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handler = (e: KeyboardEvent) => {
      if (libraryOpen) return; // Don't capture keys when modal is open
      keyPress(e);
    };

    el.addEventListener("keydown", handler);
    return () => el.removeEventListener("keydown", handler);
  }, [keyPress, libraryOpen]);

  // Focus container on mount and click
  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  useEffect(() => {
    const pre = preRef.current;
    const container = containerRef.current;
    if (!pre || !container) return;
    const containerRect = container.getBoundingClientRect();
    const headerHeight = 28;
    const pad = 16;
    const availW = containerRect.width - pad * 2;
    const availH = containerRect.height - headerHeight - pad * 2;

    // Measure actual character width using a temporary element
    const measure = document.createElement('span');
    measure.style.font = getComputedStyle(pre).font;
    measure.style.visibility = 'hidden';
    measure.style.position = 'absolute';
    measure.style.whiteSpace = 'pre';
    measure.textContent = 'X'.repeat(cols);
    document.body.appendChild(measure);
    const natW = measure.offsetWidth;
    document.body.removeChild(measure);

    const natH = pre.scrollHeight;
    if (natW > 0 && natH > 0) {
      setTermScale({ x: availW / natW, y: availH / natH });
    }
  }, [lines, cols]);

  const focusTerminal = useCallback(() => {
    containerRef.current?.focus();
  }, []);

  const handleLoadSoftware = useCallback(
    (entry: SoftwareEntry) => {
      loadSoftware(entry);
      setLibraryOpen(false);
      setLoadedEntry(entry);
      setSoftwareName(entry.name);
      onSoftwareLoad?.(entry.id);
      setTimeout(() => containerRef.current?.focus(), 0);
    },
    [loadSoftware, onSoftwareLoad]
  );

  const dismissToast = useCallback(() => setLoadedEntry(null), []);

  const [copied, setCopied] = useState(false);
  const copyTerminalText = useCallback(() => {
    const text = (lines.length > 0 ? lines : []).map((l) => l.trimEnd()).join("\n").trimEnd();
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [lines]);

  // Render rows from emulator terminal state
  // lines is already a string[] of length ROWS, each padded to COLS
  const displayLines = lines.length > 0 ? lines : Array(rows).fill(" ".repeat(cols));

  return (
    <div
      ref={containerRef}
      className="apple1-screen border border-terminal-border bg-terminal-bg flex flex-col cursor-text outline-none relative mx-auto"
      style={{ width: "720px", height: "540px" }}
      onClick={focusTerminal}
      tabIndex={0}
    >
      <div className="flex items-center justify-between px-3 py-1 border-b border-terminal-border select-none">
        <span className="text-xs text-terminal-border truncate">{softwareName}</span>
        <div className="flex gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              reset();
              setSoftwareName("Woz Monitor");
              containerRef.current?.focus();
            }}
            className="text-xs text-terminal-border hover:text-[var(--color-apple1-text)] border border-terminal-border hover:border-[var(--color-apple1-text)] px-2 py-0.5"
            title="Reset (cold boot)"
          >
            RESET
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setLibraryOpen(true);
            }}
            className="text-xs text-terminal-border hover:text-[var(--color-apple1-text)] border border-terminal-border hover:border-[var(--color-apple1-text)] px-2 py-0.5"
            title="Software Library"
          >
            LOAD
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              copyTerminalText();
            }}
            className="text-xs text-terminal-border hover:text-[var(--color-apple1-text)] border border-terminal-border hover:border-[var(--color-apple1-text)] px-2 py-0.5"
            title="Copy terminal text to clipboard"
          >
            {copied ? "COPIED" : "COPY"}
          </button>
        </div>
        <span className="text-xs text-terminal-border">{cols}&times;{rows}</span>
      </div>
      <pre
        ref={preRef}
        className="apple1-terminal overflow-hidden"
        style={{
          transform: `scale(${termScale.x}, ${termScale.y})`,
          transformOrigin: "top left",
          position: "absolute",
          top: "44px",
          left: "16px",
        }}
      >
        {displayLines.map((line: string, i: number) => (
          <div key={i}>
            {i === cursorRow ? (
              <>
                {line.substring(0, cursorCol)}
                {cursorVisible ? (
                  <span className="bg-[var(--color-apple1-text)] text-terminal-bg">
                    {line.charAt(cursorCol) || " "}
                  </span>
                ) : (
                  <span>{line.charAt(cursorCol) || " "}</span>
                )}
                {line.substring(cursorCol + 1)}
              </>
            ) : (
              line
            )}
          </div>
        ))}
      </pre>
      {/* Post-load toast notification */}
      {loadedEntry && (
        <LoadToast entry={loadedEntry} onDismiss={dismissToast} />
      )}
      {/* Software Library Modal */}
      <SoftwareLibraryModal
        isOpen={libraryOpen}
        onClose={() => {
          setLibraryOpen(false);
          setTimeout(() => containerRef.current?.focus(), 0);
        }}
        onLoad={handleLoadSoftware}
        catalog={getFullCatalog()}
        machine="apple1"
      />
    </div>
  );
}

function Trs80Terminal({ terminalHandleRef, onSoftwareLoad }: { terminalHandleRef?: React.RefObject<TerminalHandle | null>; onSoftwareLoad?: (id: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const [cursorVisible, setCursorVisible] = useState(true);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [loadedEntry, setLoadedEntry] = useState<SoftwareEntry | null>(null);
  const [softwareName, setSoftwareName] = useState("Stub ROM");
  const [termScale, setTermScale] = useState({ x: 1, y: 1 });

  const { state, onKeyDown, onKeyUp, reset, loadSoftware, typeCommand } = useTrs80();

  // Expose typeCommand via ref
  useImperativeHandle(terminalHandleRef, () => ({ typeCommand }), [typeCommand]);

  const { lines, screenCodes, cursorRow, cursorCol } = state;
  const cols = TERMINAL_COLS.trs80;
  const rows = TERMINAL_ROWS.trs80;

  // Cursor blink
  useEffect(() => {
    const interval = setInterval(() => setCursorVisible((v) => !v), 530);
    return () => clearInterval(interval);
  }, []);

  // Capture keyboard events on the container div
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (libraryOpen) return;
      onKeyDown(e);
    };

    el.addEventListener("keydown", handleKeyDown);
    el.addEventListener("keyup", onKeyUp);
    return () => {
      el.removeEventListener("keydown", handleKeyDown);
      el.removeEventListener("keyup", onKeyUp);
    };
  }, [onKeyDown, onKeyUp, libraryOpen]);

  // Focus container on mount
  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  useEffect(() => {
    const pre = preRef.current;
    const container = containerRef.current;
    if (!pre || !container) return;
    const containerRect = container.getBoundingClientRect();
    const headerHeight = 28;
    const pad = 16;
    const availW = containerRect.width - pad * 2;
    const availH = containerRect.height - headerHeight - pad * 2;

    // Measure actual character width using a temporary element
    const measure = document.createElement('span');
    measure.style.font = getComputedStyle(pre).font;
    measure.style.visibility = 'hidden';
    measure.style.position = 'absolute';
    measure.style.whiteSpace = 'pre';
    measure.textContent = 'X'.repeat(cols);
    document.body.appendChild(measure);
    const natW = measure.offsetWidth;
    document.body.removeChild(measure);

    const natH = pre.scrollHeight;
    if (natW > 0 && natH > 0) {
      setTermScale({ x: availW / natW, y: availH / natH });
    }
  }, [lines, cols]);

  const focusTerminal = useCallback(() => {
    containerRef.current?.focus();
  }, []);

  const handleLoadSoftware = useCallback(
    (entry: SoftwareEntry) => {
      loadSoftware(entry);
      setLibraryOpen(false);
      setLoadedEntry(entry);
      setSoftwareName(entry.name);
      onSoftwareLoad?.(entry.id);
      setTimeout(() => containerRef.current?.focus(), 0);
    },
    [loadSoftware, onSoftwareLoad]
  );

  const dismissToast = useCallback(() => setLoadedEntry(null), []);

  const [copied, setCopied] = useState(false);
  const copyTerminalText = useCallback(() => {
    const text = (lines.length > 0 ? lines : []).map((l) => l.trimEnd()).join("\n").trimEnd();
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [lines]);

  const displayLines = lines.length > 0 ? lines : Array(rows).fill(" ".repeat(cols));

  // Hide emulator cursor when BASIC draws its own underscore cursor
  const cursorChar = displayLines[cursorRow]?.charAt(cursorCol);
  const showCursor = cursorChar !== '_';

  return (
    <div
      ref={containerRef}
      className="trs80-screen border border-terminal-border bg-terminal-bg flex flex-col cursor-text outline-none relative mx-auto"
      style={{ width: "720px", height: "540px" }}
      onClick={focusTerminal}
      tabIndex={0}
    >
      <div className="flex items-center justify-between px-3 py-1 border-b border-terminal-border select-none">
        <span className="text-xs text-terminal-border truncate">{softwareName}</span>
        <div className="flex gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              reset();
              setSoftwareName("Stub ROM");
              containerRef.current?.focus();
            }}
            className="text-xs text-terminal-border hover:text-terminal-green border border-terminal-border hover:border-terminal-green px-2 py-0.5"
            title="Reset (cold boot)"
          >
            RESET
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setLibraryOpen(true);
            }}
            className="text-xs text-terminal-border hover:text-terminal-green border border-terminal-border hover:border-terminal-green px-2 py-0.5"
            title="Software Library"
          >
            LOAD
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              copyTerminalText();
            }}
            className="text-xs text-terminal-border hover:text-terminal-green border border-terminal-border hover:border-terminal-green px-2 py-0.5"
            title="Copy terminal text to clipboard"
          >
            {copied ? "COPIED" : "COPY"}
          </button>
        </div>
        <span className="text-xs text-terminal-border">{cols}&times;{rows}</span>
      </div>
      <pre
        ref={preRef}
        className="trs80-terminal overflow-hidden"
        style={{
          transform: `scale(${termScale.x}, ${termScale.y})`,
          transformOrigin: "top left",
          position: "absolute",
          top: "44px",
          left: "16px",
        }}
      >
        {displayLines.map((line: string, i: number) => (
          <div key={i}>
            {renderTrs80Row(
              screenCodes[i] || [],
              line,
              i === cursorRow,
              cursorCol,
              cursorVisible,
              showCursor,
            )}
          </div>
        ))}
      </pre>
      {/* Post-load toast notification */}
      {loadedEntry && (
        <LoadToast entry={loadedEntry} onDismiss={dismissToast} />
      )}
      {/* Software Library Modal */}
      <SoftwareLibraryModal
        isOpen={libraryOpen}
        onClose={() => {
          setLibraryOpen(false);
          setTimeout(() => containerRef.current?.focus(), 0);
        }}
        onLoad={handleLoadSoftware}
        catalog={getTrs80FullCatalog()}
        machine="trs80"
      />
    </div>
  );
}

function Altair8800Terminal({ terminalHandleRef, onSoftwareLoad }: { terminalHandleRef?: React.RefObject<TerminalHandle | null>; onSoftwareLoad?: (id: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const [cursorVisible, setCursorVisible] = useState(true);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [loadedEntry, setLoadedEntry] = useState<SoftwareEntry | null>(null);
  const [softwareName, setSoftwareName] = useState("TURNKEY BOOT");
  const [termScale, setTermScale] = useState({ x: 1, y: 1 });

  const {
    state, panelState, onKeyDown, reset, loadSoftware, typeCommand,
    panelAction, toggleAddressSwitch, toggleDataSwitch,
  } = useAltair8800();

  // Expose typeCommand via ref
  useImperativeHandle(terminalHandleRef, () => ({ typeCommand }), [typeCommand]);

  const { lines, cursorRow, cursorCol } = state;
  const cols = TERMINAL_COLS.altair8800;
  const rows = TERMINAL_ROWS.altair8800;

  // Cursor blink
  useEffect(() => {
    const interval = setInterval(() => setCursorVisible((v) => !v), 530);
    return () => clearInterval(interval);
  }, []);

  // Capture keyboard events on the container div
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (libraryOpen) return;
      onKeyDown(e);
    };

    el.addEventListener("keydown", handleKeyDown);
    return () => {
      el.removeEventListener("keydown", handleKeyDown);
    };
  }, [onKeyDown, libraryOpen]);

  // Focus container on mount
  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  // Scale terminal to fit
  useEffect(() => {
    const pre = preRef.current;
    const container = containerRef.current;
    if (!pre || !container) return;
    const containerRect = container.getBoundingClientRect();
    const headerHeight = 28;
    const pad = 16;
    const availW = containerRect.width - pad * 2;
    const availH = containerRect.height - headerHeight - pad * 2;

    const measure = document.createElement('span');
    measure.style.font = getComputedStyle(pre).font;
    measure.style.visibility = 'hidden';
    measure.style.position = 'absolute';
    measure.style.whiteSpace = 'pre';
    measure.textContent = 'X'.repeat(cols);
    document.body.appendChild(measure);
    const natW = measure.offsetWidth;
    document.body.removeChild(measure);

    const natH = pre.scrollHeight;
    if (natW > 0 && natH > 0) {
      setTermScale({ x: availW / natW, y: availH / natH });
    }
  }, [lines, cols]);

  const focusTerminal = useCallback(() => {
    containerRef.current?.focus();
  }, []);

  const handleLoadSoftware = useCallback(
    (entry: SoftwareEntry) => {
      loadSoftware(entry);
      setLibraryOpen(false);
      setLoadedEntry(entry);
      setSoftwareName(entry.name);
      onSoftwareLoad?.(entry.id);
      setTimeout(() => containerRef.current?.focus(), 0);
    },
    [loadSoftware, onSoftwareLoad]
  );

  const dismissToast = useCallback(() => setLoadedEntry(null), []);

  const [copied, setCopied] = useState(false);
  const copyTerminalText = useCallback(() => {
    const text = (lines.length > 0 ? lines : []).map((l) => l.trimEnd()).join("\n").trimEnd();
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [lines]);

  const displayLines = lines.length > 0 ? lines : Array(rows).fill(" ".repeat(cols));

  return (
    <div className="flex flex-col gap-2 mx-auto" style={{ width: "720px" }}>
      {/* Front Panel */}
      <Altair8800Panel
        panelState={panelState}
        onToggleAddressSwitch={toggleAddressSwitch}
        onToggleDataSwitch={toggleDataSwitch}
        onPanelAction={panelAction}
      />

      {/* Serial Terminal */}
      <div
        ref={containerRef}
        className="altair-screen border border-terminal-border bg-terminal-bg flex flex-col cursor-text outline-none relative"
        style={{ width: "720px", height: "400px" }}
        onClick={focusTerminal}
        tabIndex={0}
      >
        <div className="flex items-center justify-between px-3 py-1 border-b border-terminal-border select-none">
          <span className="text-xs text-terminal-border truncate">{softwareName}</span>
          <div className="flex gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                reset();
                setSoftwareName("TURNKEY BOOT");
                containerRef.current?.focus();
              }}
              className="text-xs text-terminal-border hover:text-terminal-green border border-terminal-border hover:border-terminal-green px-2 py-0.5"
              title="Reset (cold boot)"
            >
              RESET
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setLibraryOpen(true);
              }}
              className="text-xs text-terminal-border hover:text-terminal-green border border-terminal-border hover:border-terminal-green px-2 py-0.5"
              title="Software Library"
            >
              LOAD
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                copyTerminalText();
              }}
              className="text-xs text-terminal-border hover:text-terminal-green border border-terminal-border hover:border-terminal-green px-2 py-0.5"
              title="Copy terminal text to clipboard"
            >
              {copied ? "COPIED" : "COPY"}
            </button>
          </div>
          <span className="text-xs text-terminal-border">{cols}&times;{rows}</span>
        </div>
        <pre
          ref={preRef}
          className="altair-terminal overflow-hidden"
          style={{
            transform: `scale(${termScale.x}, ${termScale.y})`,
            transformOrigin: "top left",
            position: "absolute",
            top: "44px",
            left: "16px",
          }}
        >
          {displayLines.map((line: string, i: number) => (
            <div key={i}>
              {i === cursorRow ? (
                <>
                  {line.substring(0, cursorCol)}
                  {cursorVisible ? (
                    <span className="bg-terminal-green text-terminal-bg">
                      {line.charAt(cursorCol) || " "}
                    </span>
                  ) : (
                    <span>{line.charAt(cursorCol) || " "}</span>
                  )}
                  {line.substring(cursorCol + 1)}
                </>
              ) : (
                line
              )}
            </div>
          ))}
        </pre>
        {/* Post-load toast notification */}
        {loadedEntry && (
          <LoadToast entry={loadedEntry} onDismiss={dismissToast} />
        )}
        {/* Software Library Modal */}
        <SoftwareLibraryModal
          isOpen={libraryOpen}
          onClose={() => {
            setLibraryOpen(false);
            setTimeout(() => containerRef.current?.focus(), 0);
          }}
          onLoad={handleLoadSoftware}
          catalog={getAltairFullCatalog()}
          machine="altair8800"
        />
      </div>
    </div>
  );
}

export function TerminalDisplay({ machine, terminalRef, onSoftwareLoad }: TerminalDisplayProps) {
  if (machine === "apple1") {
    return <Apple1Terminal terminalHandleRef={terminalRef} onSoftwareLoad={onSoftwareLoad} />;
  }
  if (machine === "altair8800") {
    return <Altair8800Terminal terminalHandleRef={terminalRef} onSoftwareLoad={onSoftwareLoad} />;
  }
  return <Trs80Terminal terminalHandleRef={terminalRef} onSoftwareLoad={onSoftwareLoad} />;
}

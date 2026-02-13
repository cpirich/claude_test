"use client";

import { useRef, useEffect, useState, useCallback, useImperativeHandle } from "react";
import { useApple1 } from "@/hooks/useApple1";
import { useTrs80 } from "@/hooks/useTrs80";
import { useAltair8800 } from "@/hooks/useAltair8800";
import { SoftwareLibraryModal } from "./SoftwareLibraryModal";
import { Altair8800Panel } from "./Altair8800Panel";
import { getFullCatalog } from "@/emulator/apple1/software-catalog";
import { getTrs80FullCatalog } from "@/emulator/trs80/software-catalog";
import { getAltairFullCatalog } from "@/emulator/altair8800/software-catalog";
import type { SoftwareEntry } from "@/emulator/apple1/software-library";

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

  const { lines, cursorRow, cursorCol } = state;
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
      className="crt-screen border border-terminal-border bg-terminal-bg flex flex-col cursor-text outline-none relative mx-auto"
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
            {i === cursorRow && showCursor ? (
              <>
                {line.substring(0, cursorCol)}
                {cursorVisible ? (
                  <span className="trs80-cursor bg-white text-terminal-bg">
                    {line.charAt(cursorCol) || " "}
                  </span>
                ) : (
                  <span className="trs80-cursor">{line.charAt(cursorCol) || " "}</span>
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
        className="crt-screen border border-terminal-border bg-terminal-bg flex flex-col cursor-text outline-none relative"
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

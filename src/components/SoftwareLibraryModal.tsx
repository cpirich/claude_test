"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type {
  SoftwareEntry,
  SoftwareCategory,
  MachineType,
  ProgramFileFormat,
} from "@/emulator/apple1/software-library";
import { fetchProgram } from "@/lib/fetch-program";
import { parseProgram } from "@/lib/program-parser";
import {
  isZipData,
  isZipFilename,
  listZipFiles,
  extractZipFile,
  type ZipFileEntry,
} from "@/lib/zip-extract";

interface SoftwareLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoad: (entry: SoftwareEntry) => void;
  catalog: SoftwareEntry[];
  machine: MachineType;
}

type TopTab = "browse" | "url" | "file";
type CategoryFilter = SoftwareCategory | "all";
type FormatOption = ProgramFileFormat | "auto";

const CATEGORY_LABELS: Record<CategoryFilter, string> = {
  all: "ALL",
  language: "LANG",
  diagnostic: "DIAG",
  utility: "UTIL",
  demo: "DEMO",
  game: "GAME",
};

const FORMAT_LABELS: Record<FormatOption, string> = {
  auto: "AUTO",
  binary: "BINARY",
  "intel-hex": "HEX",
  "woz-hex-dump": "WOZ",
  "trs80-bas": "BAS",
  "trs80-cmd": "CMD",
};

const MACHINE_FORMATS: Record<MachineType, FormatOption[]> = {
  apple1: ["auto", "binary", "intel-hex", "woz-hex-dump"],
  trs80: ["auto", "binary", "intel-hex", "trs80-bas", "trs80-cmd"],
  altair8800: ["auto", "binary", "intel-hex"],
};

function formatSize(bytes: number): string {
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  if (bytes === 0) return "?";
  return `${bytes}B`;
}

/** Styled toggle button used for tabs and format selectors. */
function ToggleButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-2 py-0.5 border text-xs ${
        active
          ? "border-terminal-green text-terminal-green bg-terminal-green/10"
          : "border-terminal-border text-terminal-border hover:border-terminal-green/50"
      }`}
    >
      {children}
    </button>
  );
}

/** Hex address input with $ prefix. */
function HexInput({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  label: string;
}) {
  const [text, setText] = useState(value.toString(16).toUpperCase().padStart(4, "0"));

  useEffect(() => {
    setText(value.toString(16).toUpperCase().padStart(4, "0"));
  }, [value]);

  return (
    <label className="flex items-center gap-2 text-xs text-terminal-border">
      <span>{label}:</span>
      <span className="text-terminal-green">$</span>
      <input
        type="text"
        value={text}
        onChange={(e) => {
          const raw = e.target.value.replace(/[^0-9A-Fa-f]/g, "").slice(0, 4);
          setText(raw);
          const parsed = parseInt(raw, 16);
          if (!isNaN(parsed)) onChange(parsed);
        }}
        className="w-16 bg-transparent border border-terminal-border text-terminal-green px-1 font-mono text-xs focus:border-terminal-green outline-none"
        maxLength={4}
      />
    </label>
  );
}

// ─── BROWSE TAB ──────────────────────────────────────────

function BrowseTab({
  catalog,
  onLoad,
}: {
  catalog: SoftwareEntry[];
  onLoad: (entry: SoftwareEntry) => void;
}) {
  const [selectedCategory, setSelectedCategory] = useState<CategoryFilter>("all");
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(
    catalog[0]?.id ?? null
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered =
    selectedCategory === "all"
      ? catalog
      : catalog.filter((e) => e.category === selectedCategory);

  const selectedEntry =
    filtered.find((e) => e.id === selectedEntryId) ?? filtered[0] ?? null;

  // Auto-select first entry when filter changes
  useEffect(() => {
    if (filtered.length > 0 && !filtered.find((e) => e.id === selectedEntryId)) {
      setSelectedEntryId(filtered[0].id);
    }
  }, [selectedCategory, filtered, selectedEntryId]);

  const categoriesWithEntries = new Set(catalog.map((e) => e.category));
  const visibleCategories: CategoryFilter[] = [
    "all",
    ...(Object.keys(CATEGORY_LABELS).filter(
      (k) => k !== "all" && categoriesWithEntries.has(k as SoftwareCategory)
    ) as CategoryFilter[]),
  ];

  const isRemote = selectedEntry?.url && selectedEntry.regions.length === 0;

  async function handleLoad() {
    if (!selectedEntry) return;
    setError(null);

    if (isRemote && selectedEntry.url) {
      setLoading(true);
      try {
        const result = await fetchProgram(selectedEntry.url);
        const parsed = parseProgram(result.data, {
          format: selectedEntry.format ?? undefined,
          loadAddress: selectedEntry.defaultLoadAddress ?? selectedEntry.entryPoint,
        });
        const hydrated: SoftwareEntry = {
          ...selectedEntry,
          regions: parsed.regions,
          sizeBytes: parsed.sizeBytes > 0 ? parsed.sizeBytes : selectedEntry.sizeBytes,
          addressRange:
            parsed.addressRange !== "$0000" ? parsed.addressRange : selectedEntry.addressRange,
          textMode: parsed.textMode,
          listing: parsed.listing,
        };
        onLoad(hydrated);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    } else {
      onLoad(selectedEntry);
    }
  }

  return (
    <>
      {/* Category tabs */}
      <div className="flex gap-1 px-3 py-2 border-b border-terminal-border flex-wrap">
        {visibleCategories.map((cat) => (
          <ToggleButton
            key={cat}
            active={selectedCategory === cat}
            onClick={() => setSelectedCategory(cat)}
          >
            {CATEGORY_LABELS[cat]}
          </ToggleButton>
        ))}
      </div>

      {/* Entry list */}
      <div className="max-h-48 overflow-y-auto border-b border-terminal-border">
        {filtered.map((entry) => (
          <button
            key={entry.id}
            onClick={() => {
              setSelectedEntryId(entry.id);
              setError(null);
            }}
            className={`w-full text-left px-3 py-1 flex items-center justify-between ${
              entry.id === selectedEntry?.id
                ? "bg-terminal-green/10 text-terminal-green"
                : "text-terminal-border hover:text-terminal-green hover:bg-terminal-green/5"
            }`}
          >
            <span className="flex items-center gap-2 min-w-0">
              <span className="shrink-0">
                {entry.id === selectedEntry?.id ? ">" : " "}
              </span>
              <span className="truncate">{entry.name}</span>
              {entry.url && entry.regions.length === 0 && (
                <span className="text-terminal-border text-xs shrink-0">[DL]</span>
              )}
            </span>
            <span className="text-xs text-terminal-border shrink-0 ml-2">
              {entry.addressRange} {formatSize(entry.sizeBytes)}
            </span>
          </button>
        ))}
        {filtered.length === 0 && (
          <div className="px-3 py-4 text-terminal-border text-center">
            No programs in this category.
          </div>
        )}
      </div>

      {/* Detail panel */}
      {selectedEntry && (
        <div className="px-3 py-3">
          <div className="text-terminal-green font-bold mb-1">
            {selectedEntry.name}
          </div>
          <div className="text-terminal-border text-xs mb-2">
            {selectedEntry.description}
          </div>
          <div className="text-terminal-border text-xs space-y-0.5 mb-3">
            <div>
              AUTHOR: {selectedEntry.author}
              {selectedEntry.year ? `, ${selectedEntry.year}` : ""}
            </div>
            <div>
              LOAD: {selectedEntry.addressRange}
              {"  "}ENTRY: $
              {selectedEntry.entryPoint.toString(16).toUpperCase().padStart(4, "0")}
            </div>
            <div>SIZE: {formatSize(selectedEntry.sizeBytes)}</div>
            {selectedEntry.loadInstructions && (
              <div className="mt-1 text-terminal-green/70">
                AFTER LOAD: {selectedEntry.loadInstructions}
              </div>
            )}
            {selectedEntry.notes && (
              <div className="mt-1 text-terminal-border/60">
                {selectedEntry.notes}
              </div>
            )}
          </div>

          {error && (
            <div className="text-xs mb-2">
              <span className="text-red-500">ERR: {error}</span>
              <button
                onClick={handleLoad}
                className="ml-2 text-terminal-green hover:underline"
              >
                [RETRY]
              </button>
            </div>
          )}

          <div className="flex justify-center">
            <button
              onClick={handleLoad}
              disabled={loading}
              className="px-4 py-1 border border-terminal-green text-terminal-green hover:bg-terminal-green/10 text-sm disabled:opacity-50"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="animate-pulse">*</span> LOADING...
                </span>
              ) : isRemote ? (
                "DOWNLOAD & LOAD"
              ) : selectedEntry.regions.length === 0 && !selectedEntry.url ? (
                "IN ROM"
              ) : (
                "LOAD"
              )}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// ─── ZIP FILE PICKER ─────────────────────────────────────

function ZipFilePicker({
  files,
  zipData,
  onLoad,
  onBack,
  format,
  loadAddress,
  entryPoint,
}: {
  files: ZipFileEntry[];
  zipData: Uint8Array;
  onLoad: (entry: SoftwareEntry) => void;
  onBack: () => void;
  format: FormatOption;
  loadAddress: number;
  entryPoint: number;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSelect(file: ZipFileEntry) {
    setError(null);
    setLoading(true);
    try {
      const data = await extractZipFile(zipData, file.path);
      const fmt = format === "auto" ? undefined : format;
      const parsed = parseProgram(data, { format: fmt, loadAddress });

      const entry: SoftwareEntry = {
        id: `zip-${Date.now()}`,
        name: file.name.toUpperCase().replace(/\.[^.]+$/, ""),
        description: `Extracted from archive: ${file.name}`,
        category: "utility",
        regions: parsed.regions,
        entryPoint: parsed.entryPoint ?? entryPoint,
        author: "Unknown",
        sizeBytes: parsed.sizeBytes,
        addressRange: parsed.addressRange,
        isStub: false,
        textMode: parsed.textMode,
        listing: parsed.listing,
      };
      onLoad(entry);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="px-3 py-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-terminal-green font-bold text-xs">
          SELECT FILE FROM ARCHIVE ({files.length} files)
        </div>
        <button
          onClick={onBack}
          className="text-xs text-terminal-border hover:text-terminal-green"
        >
          [BACK]
        </button>
      </div>

      <div className="max-h-48 overflow-y-auto border border-terminal-border mb-2">
        {files.map((file) => (
          <button
            key={file.path}
            onClick={() => handleSelect(file)}
            disabled={loading}
            className="w-full text-left px-2 py-1 flex items-center justify-between text-terminal-border hover:text-terminal-green hover:bg-terminal-green/5 disabled:opacity-50"
          >
            <span className="truncate text-xs">{file.name}</span>
            <span className="text-xs shrink-0 ml-2">
              {formatSize(file.sizeBytes)}
            </span>
          </button>
        ))}
      </div>

      {loading && (
        <div className="text-xs text-terminal-green animate-pulse text-center">
          * EXTRACTING...
        </div>
      )}
      {error && (
        <div className="text-xs">
          <span className="text-red-500">ERR: {error}</span>
        </div>
      )}
    </div>
  );
}

// ─── URL TAB ─────────────────────────────────────────────

function UrlTab({ onLoad, machine }: { onLoad: (entry: SoftwareEntry) => void; machine: MachineType }) {
  const [url, setUrl] = useState("");
  const [format, setFormat] = useState<FormatOption>("auto");
  const [loadAddress, setLoadAddress] = useState(0x0300);
  const [entryPoint, setEntryPoint] = useState(0x0300);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zipFiles, setZipFiles] = useState<ZipFileEntry[] | null>(null);
  const [zipData, setZipData] = useState<Uint8Array | null>(null);

  async function handleFetch() {
    if (!url.trim()) return;
    setError(null);
    setLoading(true);
    setZipFiles(null);
    setZipData(null);

    try {
      const result = await fetchProgram(url.trim());

      // Check if it's a zip file
      if (isZipData(result.data) || isZipFilename(url.trim())) {
        const files = await listZipFiles(result.data);
        if (files.length === 0) {
          setError("ZIP archive is empty");
        } else {
          setZipData(result.data);
          setZipFiles(files);
        }
        return;
      }

      const fmt = format === "auto" ? undefined : format;
      const parsed = parseProgram(result.data, {
        format: fmt,
        loadAddress,
      });

      const filename = url.split("/").pop() ?? "program";
      const entry: SoftwareEntry = {
        id: `url-${Date.now()}`,
        name: filename.toUpperCase(),
        description: `Loaded from ${url}`,
        category: "utility",
        regions: parsed.regions,
        entryPoint: parsed.entryPoint ?? entryPoint,
        author: "Unknown",
        sizeBytes: parsed.sizeBytes,
        addressRange: parsed.addressRange,
        isStub: false,
        textMode: parsed.textMode,
        listing: parsed.listing,
      };
      onLoad(entry);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  // Show zip file picker when a zip archive was fetched
  if (zipFiles && zipData) {
    return (
      <ZipFilePicker
        files={zipFiles}
        zipData={zipData}
        onLoad={onLoad}
        onBack={() => {
          setZipFiles(null);
          setZipData(null);
        }}
        format={format}
        loadAddress={loadAddress}
        entryPoint={entryPoint}
      />
    );
  }

  return (
    <div className="px-3 py-3 space-y-3">
      <div className="text-terminal-green font-bold text-xs mb-2">LOAD FROM URL</div>

      <div>
        <label className="text-xs text-terminal-border block mb-1">URL:</label>
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com/program.bin"
          className="w-full bg-transparent border border-terminal-border text-terminal-green px-2 py-1 font-mono text-xs focus:border-terminal-green outline-none placeholder:text-terminal-border/40"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.stopPropagation();
              handleFetch();
            }
          }}
        />
      </div>

      <div>
        <label className="text-xs text-terminal-border block mb-1">FORMAT:</label>
        <div className="flex gap-1 flex-wrap">
          {MACHINE_FORMATS[machine].map((f) => (
            <ToggleButton key={f} active={format === f} onClick={() => setFormat(f)}>
              {FORMAT_LABELS[f]}
            </ToggleButton>
          ))}
        </div>
      </div>

      {(format === "binary" || format === "auto") && (
        <div className="flex gap-4 flex-wrap">
          <HexInput value={loadAddress} onChange={setLoadAddress} label="LOAD ADDRESS" />
          <HexInput value={entryPoint} onChange={setEntryPoint} label="ENTRY POINT" />
        </div>
      )}

      {error && (
        <div className="text-xs">
          <span className="text-red-500">ERR: {error}</span>
          <button
            onClick={handleFetch}
            className="ml-2 text-terminal-green hover:underline"
          >
            [RETRY]
          </button>
        </div>
      )}

      <div className="flex justify-center pt-1">
        <button
          onClick={handleFetch}
          disabled={loading || !url.trim()}
          className="px-4 py-1 border border-terminal-green text-terminal-green hover:bg-terminal-green/10 text-sm disabled:opacity-50"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <span className="animate-pulse">*</span> FETCHING...
            </span>
          ) : (
            "FETCH & LOAD"
          )}
        </button>
      </div>
    </div>
  );
}

// ─── FILE TAB ────────────────────────────────────────────

function FileTab({ onLoad, machine }: { onLoad: (entry: SoftwareEntry) => void; machine: MachineType }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [format, setFormat] = useState<FormatOption>("auto");
  const [loadAddress, setLoadAddress] = useState(0x0300);
  const [entryPoint, setEntryPoint] = useState(0x0300);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zipFiles, setZipFiles] = useState<ZipFileEntry[] | null>(null);
  const [zipData, setZipData] = useState<Uint8Array | null>(null);

  async function processFile(file: File) {
    setError(null);
    setZipFiles(null);
    setZipData(null);

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const data = new Uint8Array(reader.result as ArrayBuffer);

        // Check if it's a zip file
        if (isZipData(data) || isZipFilename(file.name)) {
          const files = await listZipFiles(data);
          if (files.length === 0) {
            setError("ZIP archive is empty");
          } else {
            setZipData(data);
            setZipFiles(files);
          }
          return;
        }

        const fmt = format === "auto" ? undefined : format;
        const parsed = parseProgram(data, { format: fmt, loadAddress });

        const entry: SoftwareEntry = {
          id: `file-${Date.now()}`,
          name: file.name.toUpperCase().replace(/\.[^.]+$/, ""),
          description: `Loaded from local file: ${file.name}`,
          category: "utility",
          regions: parsed.regions,
          entryPoint: parsed.entryPoint ?? entryPoint,
          author: "Unknown",
          sizeBytes: parsed.sizeBytes,
          addressRange: parsed.addressRange,
          isStub: false,
          textMode: parsed.textMode,
          listing: parsed.listing,
        };
        onLoad(entry);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    };
    reader.onerror = () => setError("Failed to read file");
    reader.readAsArrayBuffer(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }

  // Show zip file picker when a zip archive was loaded
  if (zipFiles && zipData) {
    return (
      <ZipFilePicker
        files={zipFiles}
        zipData={zipData}
        onLoad={onLoad}
        onBack={() => {
          setZipFiles(null);
          setZipData(null);
        }}
        format={format}
        loadAddress={loadAddress}
        entryPoint={entryPoint}
      />
    );
  }

  return (
    <div className="px-3 py-3 space-y-3">
      <div className="text-terminal-green font-bold text-xs mb-2">LOAD FROM FILE</div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed py-6 text-center cursor-pointer transition-colors ${
          dragging
            ? "border-terminal-green bg-terminal-green/10 text-terminal-green"
            : "border-terminal-border text-terminal-border hover:border-terminal-green/50"
        }`}
      >
        <div className="text-xs mb-1">DROP FILE HERE</div>
        <div className="text-xs mb-2">or click to browse</div>
        <div className="text-xs text-terminal-border/60">
          .bin .hex .ihx .txt .rom .zip .cmd .bas .asm .cas
        </div>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".bin,.hex,.ihx,.txt,.rom,.zip,.cmd,.bas,.asm,.cas"
        onChange={handleFileSelect}
        className="hidden"
      />

      <div>
        <label className="text-xs text-terminal-border block mb-1">FORMAT:</label>
        <div className="flex gap-1 flex-wrap">
          {MACHINE_FORMATS[machine].map((f) => (
            <ToggleButton key={f} active={format === f} onClick={() => setFormat(f)}>
              {FORMAT_LABELS[f]}
            </ToggleButton>
          ))}
        </div>
      </div>

      {(format === "binary" || format === "auto") && (
        <div className="flex gap-4 flex-wrap">
          <HexInput value={loadAddress} onChange={setLoadAddress} label="LOAD ADDRESS" />
          <HexInput value={entryPoint} onChange={setEntryPoint} label="ENTRY POINT" />
        </div>
      )}

      {error && (
        <div className="text-xs">
          <span className="text-red-500">ERR: {error}</span>
        </div>
      )}
    </div>
  );
}

// ─── MAIN MODAL ──────────────────────────────────────────

export function SoftwareLibraryModal({
  isOpen,
  onClose,
  onLoad,
  catalog,
  machine,
}: SoftwareLibraryModalProps) {
  const [activeTab, setActiveTab] = useState<TopTab>("browse");

  // Reset to browse tab when modal opens (React-recommended state-during-render pattern)
  const [lastIsOpen, setLastIsOpen] = useState(isOpen);
  if (isOpen !== lastIsOpen) {
    setLastIsOpen(isOpen);
    if (isOpen) {
      setActiveTab("browse");
    }
  }

  // Escape to close
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    },
    [isOpen, onClose]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80" onClick={onClose} />

      {/* Modal */}
      <div className="relative border border-terminal-green bg-terminal-bg max-w-lg w-full mx-4 font-mono text-sm max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-terminal-border shrink-0">
          <span className="text-terminal-green font-bold">SOFTWARE LIBRARY</span>
          <button
            onClick={onClose}
            className="text-terminal-border hover:text-terminal-green px-1"
          >
            [X]
          </button>
        </div>

        {/* Top-level tabs */}
        <div className="flex gap-1 px-3 py-2 border-b border-terminal-border shrink-0">
          <ToggleButton
            active={activeTab === "browse"}
            onClick={() => setActiveTab("browse")}
          >
            BROWSE
          </ToggleButton>
          <ToggleButton
            active={activeTab === "url"}
            onClick={() => setActiveTab("url")}
          >
            URL
          </ToggleButton>
          <ToggleButton
            active={activeTab === "file"}
            onClick={() => setActiveTab("file")}
          >
            FILE
          </ToggleButton>
        </div>

        {/* Tab content */}
        <div className="overflow-y-auto flex-1">
          {activeTab === "browse" && (
            <BrowseTab catalog={catalog} onLoad={onLoad} />
          )}
          {activeTab === "url" && <UrlTab onLoad={onLoad} machine={machine} />}
          {activeTab === "file" && <FileTab onLoad={onLoad} machine={machine} />}
        </div>
      </div>
    </div>
  );
}

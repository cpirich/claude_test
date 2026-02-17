"use client";

import { useState, useCallback } from "react";
import { Menu, RotateCcw, Download, Copy, Play, Square, Search, ArrowDown, ArrowUp } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import type { PanelAction } from "@/components/Altair8800Panel";

type Machine = "apple1" | "trs80" | "altair8800";

const MACHINES: { id: Machine; label: string; spec: string }[] = [
  { id: "apple1", label: "Apple I", spec: "6502 @ 1.023 MHz" },
  { id: "trs80", label: "TRS-80 Model I", spec: "Z80 @ 1.774 MHz" },
  { id: "altair8800", label: "Altair 8800", spec: "8080 @ 2 MHz" },
];

interface MobileOverlayProps {
  selectedMachine: Machine;
  onMachineChange: (machine: Machine) => void;
  onReset: () => void;
  onLoad: () => void;
  onCopy: () => void;
  currentSoftware: string | null;
  /** Called when sheet opens (to blur keyboard) */
  onSheetOpen?: () => void;
  /** Called when sheet closes (to re-focus keyboard) */
  onSheetClose?: () => void;
  /** Altair panel actions (only for altair8800) */
  onPanelAction?: (action: PanelAction) => void;
}

export function MobileOverlay({
  selectedMachine,
  onMachineChange,
  onReset,
  onLoad,
  onCopy,
  currentSoftware,
  onSheetOpen,
  onSheetClose,
  onPanelAction,
}: MobileOverlayProps) {
  const [open, setOpen] = useState(false);

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      setOpen(isOpen);
      if (isOpen) {
        // Blur active element before Sheet applies aria-hidden to the page
        (document.activeElement as HTMLElement)?.blur?.();
        onSheetOpen?.();
      } else {
        onSheetClose?.();
      }
    },
    [onSheetOpen, onSheetClose]
  );

  const handleAction = useCallback(
    (action: () => void) => {
      action();
      setOpen(false);
      onSheetClose?.();
    },
    [onSheetClose]
  );

  return (
    <>
      {/* Floating action button */}
      <button
        className="mobile-fab"
        onClick={() => handleOpenChange(true)}
        aria-label="Menu"
      >
        <Menu size={20} />
      </button>

      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent
          side="right"
          className="bg-terminal-bg border-terminal-border font-mono w-[280px] p-0 overflow-hidden"
          showCloseButton={false}
        >
          <SheetHeader className="px-4 pt-4 pb-2 border-b border-terminal-border flex-shrink-0">
            <SheetTitle className="text-terminal-green text-sm">EMULATOR</SheetTitle>
            <SheetDescription className="text-terminal-border text-xs">
              {currentSoftware ?? "No software loaded"}
            </SheetDescription>
          </SheetHeader>

          {/* Scrollable content area */}
          <div className="flex-1 overflow-y-auto">
          {/* Machine selector */}
          <div className="px-4 py-3 border-b border-terminal-border">
            <div className="text-xs text-terminal-border mb-2">MACHINE</div>
            <div className="flex flex-col gap-1">
              {MACHINES.map(({ id, label, spec }) => (
                <button
                  key={id}
                  onClick={() => handleAction(() => onMachineChange(id))}
                  className={`text-left px-3 py-2 border text-xs ${
                    selectedMachine === id
                      ? "border-terminal-green text-terminal-green bg-terminal-green/10"
                      : "border-terminal-border text-terminal-border hover:border-terminal-green/50"
                  }`}
                >
                  <div className="font-bold">{label}</div>
                  <div className="text-[10px] mt-0.5 opacity-70">{spec}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="px-4 py-3 border-b border-terminal-border">
            <div className="text-xs text-terminal-border mb-2">ACTIONS</div>
            <div className="flex flex-col gap-1">
              <button
                onClick={() => handleAction(onReset)}
                className="flex items-center gap-2 px-3 py-2 border border-terminal-border text-terminal-border hover:border-terminal-green/50 hover:text-terminal-green text-xs"
              >
                <RotateCcw size={14} />
                RESET
              </button>
              <button
                onClick={() => handleAction(onLoad)}
                className="flex items-center gap-2 px-3 py-2 border border-terminal-border text-terminal-border hover:border-terminal-green/50 hover:text-terminal-green text-xs"
              >
                <Download size={14} />
                LOAD SOFTWARE
              </button>
              <button
                onClick={() => handleAction(onCopy)}
                className="flex items-center gap-2 px-3 py-2 border border-terminal-border text-terminal-border hover:border-terminal-green/50 hover:text-terminal-green text-xs"
              >
                <Copy size={14} />
                COPY TERMINAL
              </button>
            </div>
          </div>

          {/* Altair panel controls */}
          {selectedMachine === "altair8800" && onPanelAction && (
            <div className="px-4 py-3">
              <div className="text-xs text-terminal-border mb-2">PANEL CONTROLS</div>
              <div className="grid grid-cols-2 gap-1">
                {(
                  [
                    { action: "run" as PanelAction, label: "RUN", icon: Play },
                    { action: "stop" as PanelAction, label: "STOP", icon: Square },
                    { action: "examine" as PanelAction, label: "EXAMINE", icon: Search },
                    { action: "examineNext" as PanelAction, label: "EXAM NEXT", icon: ArrowDown },
                    { action: "deposit" as PanelAction, label: "DEPOSIT", icon: ArrowUp },
                    { action: "depositNext" as PanelAction, label: "DEP NEXT", icon: ArrowDown },
                    { action: "singleStep" as PanelAction, label: "STEP", icon: Play },
                    { action: "reset" as PanelAction, label: "RESET", icon: RotateCcw },
                  ] as const
                ).map(({ action, label, icon: Icon }) => (
                  <button
                    key={action}
                    onClick={() => handleAction(() => onPanelAction(action))}
                    className="flex items-center gap-1.5 px-2 py-1.5 border border-terminal-border text-terminal-border hover:border-terminal-green/50 hover:text-terminal-green text-[10px]"
                  >
                    <Icon size={12} />
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
          </div>{/* end scrollable content */}
        </SheetContent>
      </Sheet>
    </>
  );
}

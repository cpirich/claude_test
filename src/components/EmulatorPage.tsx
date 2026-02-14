"use client";

import { useState, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { MachineInfo } from "@/components/MachineInfo";
import type { TerminalHandle } from "@/components/TerminalDisplay";

const TerminalDisplay = dynamic(
  () => import("@/components/TerminalDisplay").then((m) => m.TerminalDisplay),
  {
    ssr: false,
    loading: () => <TerminalSkeleton />,
  }
);

function TerminalSkeleton() {
  return (
    <div className="border border-terminal-border bg-terminal-bg flex flex-col">
      <div className="flex items-center justify-between px-3 py-1 border-b border-terminal-border">
        <span className="text-xs text-terminal-border">Loading...</span>
      </div>
      <div
        className="p-3 font-mono text-sm leading-5 text-terminal-green/30"
        style={{ minHeight: "30rem" }}
      >
        {Array.from({ length: 16 }, (_, i) => (
          <div key={i}>&nbsp;</div>
        ))}
      </div>
    </div>
  );
}

type Machine = "apple1" | "trs80" | "altair8800";

const MACHINES: Record<Machine, { label: string; spec: string }> = {
  apple1: { label: "Apple I", spec: "6502 @ 1.023 MHz \u00b7 40\u00d724" },
  trs80: { label: "TRS-80 Model I", spec: "Z80 @ 1.774 MHz \u00b7 64\u00d716" },
  altair8800: { label: "Altair 8800", spec: "8080 @ 2 MHz \u00b7 80\u00d724 + Panel" },
};

interface EmulatorPageProps {
  initialMachine: Machine;
}

export function EmulatorPage({ initialMachine }: EmulatorPageProps) {
  const router = useRouter();
  const [selectedMachine, setSelectedMachine] = useState<Machine>(initialMachine);
  const [infoCollapsed, setInfoCollapsed] = useState(false);
  const terminalRef = useRef<TerminalHandle | null>(null);
  const [currentSoftware, setCurrentSoftware] = useState<string | null>(null);

  const handleSoftwareLoad = useCallback((softwareId: string) => {
    setCurrentSoftware(softwareId);
  }, []);

  const handleMachineChange = (value: string) => {
    const machine = value as Machine;
    setSelectedMachine(machine);
    setCurrentSoftware(null);
    router.push(`/${machine}`, { scroll: false });
  };

  return (
    <div className="min-h-screen flex flex-col items-center p-4">
      <main className="w-full max-w-3xl flex-1 flex flex-col">
        <Tabs
          value={selectedMachine}
          onValueChange={handleMachineChange}
          className="flex flex-col flex-1"
        >
          <div className="flex items-center justify-between mb-3 gap-3">
            <h1 className="text-sm font-mono text-terminal-green whitespace-nowrap shrink-0">
              Claude Microcomputer Emulator
            </h1>
            <TabsList>
              {(Object.entries(MACHINES) as [Machine, typeof MACHINES[Machine]][]).map(
                ([id, { label }]) => (
                  <TabsTrigger key={id} value={id}>
                    {label}
                  </TabsTrigger>
                )
              )}
            </TabsList>
            <Badge variant="outline" className="text-terminal-green border-terminal-border font-mono text-xs shrink-0">
              {MACHINES[selectedMachine].spec}
            </Badge>
          </div>

          <MachineInfo
            machine={selectedMachine}
            collapsed={infoCollapsed}
            onToggle={() => setInfoCollapsed((v) => !v)}
            onCommandClick={(cmd) => terminalRef.current?.typeCommand(cmd)}
            currentSoftware={currentSoftware}
          />

          {(Object.keys(MACHINES) as Machine[]).map((id) => (
            <TabsContent key={id} value={id} className="flex-1 flex flex-col mt-0">
              <TerminalDisplay machine={id} terminalRef={id === selectedMachine ? terminalRef : undefined} onSoftwareLoad={id === selectedMachine ? handleSoftwareLoad : undefined} />
            </TabsContent>
          ))}
        </Tabs>
      </main>
    </div>
  );
}

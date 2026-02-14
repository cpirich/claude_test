import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { EmulatorPage } from "@/components/EmulatorPage";

const VALID_MACHINES = ["apple1", "trs80", "altair8800"] as const;
type Machine = (typeof VALID_MACHINES)[number];

const MACHINE_TITLES: Record<Machine, string> = {
  apple1: "Apple I Emulator",
  trs80: "TRS-80 Model I Emulator",
  altair8800: "Altair 8800 Emulator",
};

function isValidMachine(value: string): value is Machine {
  return (VALID_MACHINES as readonly string[]).includes(value);
}

export function generateStaticParams() {
  return VALID_MACHINES.map((machine) => ({ machine }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ machine: string }>;
}): Promise<Metadata> {
  const { machine } = await params;
  if (!isValidMachine(machine)) return {};
  return {
    title: MACHINE_TITLES[machine],
    description: `Browser-based ${MACHINE_TITLES[machine].toLowerCase()} — ${machine === "apple1" ? "MOS 6502 @ 1.023 MHz" : machine === "trs80" ? "Zilog Z80 @ 1.774 MHz" : "Intel 8080 @ 2 MHz"}`,
  };
}

export default async function MachinePage({
  params,
}: {
  params: Promise<{ machine: string }>;
}) {
  const { machine } = await params;

  if (!isValidMachine(machine)) {
    notFound();
  }

  return <EmulatorPage initialMachine={machine} />;
}

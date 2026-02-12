"use client";

import Image from "next/image";

interface MachineInfoProps {
  machine: "apple1" | "trs80";
  collapsed: boolean;
  onToggle: () => void;
  onCommandClick?: (cmd: string) => void;
  currentSoftware?: string | null;
}

type CommandSet = { cmd: string; desc: string }[];

const APPLE1_COMMANDS: Record<string, { quickStart: string[]; commands: CommandSet }> = {
  default: {
    quickStart: [
      "Click the terminal and type commands. The \u201c\\\u201d prompt is the Woz Monitor.",
      "Use LOAD to browse the software library.",
    ],
    commands: [
      { cmd: "FF00", desc: "Examine memory at $FF00" },
      { cmd: "FF00.FF0F", desc: "Dump range $FF00\u2013$FF0F" },
      { cmd: "300: A9 01", desc: "Write bytes at $0300" },
      { cmd: "300R", desc: "Run program at $0300" },
    ],
  },
  "integer-basic-full": {
    quickStart: [
      "Integer BASIC is loaded. Type commands at the > prompt.",
      "Type numbered lines to build a program, then RUN.",
    ],
    commands: [
      { cmd: "PRINT 2+2", desc: "Evaluate expression" },
      { cmd: '10 PRINT "HELLO"', desc: "Add a program line" },
      { cmd: "LIST", desc: "Show program listing" },
      { cmd: "RUN", desc: "Execute program" },
    ],
  },
};

const TRS80_COMMANDS: Record<string, { quickStart: string[]; commands: CommandSet }> = {
  default: {
    quickStart: [
      "Stub ROM loaded \u2014 echoes typed characters to the screen.",
      "Use LOAD to load Level II BASIC or other software.",
    ],
    commands: [
      { cmd: "HELLO", desc: "Echo text to screen" },
      { cmd: "ABC 123", desc: "Type anything" },
    ],
  },
  "trs80-level2-basic": {
    quickStart: [
      "Level II BASIC is loaded. Type BASIC commands at the READY prompt.",
      "Type numbered lines to build a program, then RUN to execute.",
    ],
    commands: [
      { cmd: 'PRINT "HELLO"', desc: "Print text" },
      { cmd: "10 FOR I=1 TO 5", desc: "Start a loop" },
      { cmd: "20 PRINT I*I", desc: "Print squares" },
      { cmd: "30 NEXT I", desc: "End of loop" },
      { cmd: "RUN", desc: "Execute program" },
    ],
  },
  "trs80-level1-basic": {
    quickStart: [
      "Level I BASIC is loaded. Integer-only math, no string variables.",
      "Type numbered lines to build a program, then RUN.",
    ],
    commands: [
      { cmd: "PRINT 6*7", desc: "Evaluate expression" },
      { cmd: "10 FOR I=1 TO 10", desc: "Start a loop" },
      { cmd: "20 PRINT I", desc: "Print counter" },
      { cmd: "30 NEXT I", desc: "End of loop" },
      { cmd: "RUN", desc: "Execute program" },
    ],
  },
  "trs80-diagnostic": {
    quickStart: [
      "Diagnostic ROM loaded. Tests run automatically on boot.",
      "Watch the screen for RAM, video, and keyboard test results.",
    ],
    commands: [],
  },
};

const INFO: Record<
  string,
  {
    name: string;
    year: string;
    history: string;
    image: { src: string; alt: string; attribution: string };
  }
> = {
  apple1: {
    name: "Apple I",
    year: "1976",
    history:
      "Hand-built by Steve Wozniak, the Apple I was sold as a bare circuit board for $666.66. Only ~200 were made. Users interacted through the Woz Monitor, a 256-byte ROM that lets you inspect and modify memory in hex.",
    image: {
      src: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/Apple_I_Computer.jpg/280px-Apple_I_Computer.jpg",
      alt: "Apple I computer on display at the Smithsonian",
      attribution: "Photo: Ed Uthman, CC BY-SA 2.0",
    },
  },
  trs80: {
    name: "TRS-80 Model I",
    year: "1977",
    history:
      "One of the first mass-produced PCs, sold by Radio Shack for $599. It came with a keyboard, 64\u00d716 display, and 12K Level II BASIC in ROM. Over 200,000 units were sold, making it one of the most popular early home computers.",
    image: {
      src: "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f4/Radio_Shack_Tandy_TRS-80_Model_I_System.JPG/280px-Radio_Shack_Tandy_TRS-80_Model_I_System.JPG",
      alt: "TRS-80 Model I computer system",
      attribution: "Photo: Dave Jones, CC BY-SA 4.0",
    },
  },
};

const EMPTY_COMMAND_SET = { quickStart: [] as string[], commands: [] as CommandSet };

function getCommandSet(machine: string, currentSoftware: string | null | undefined) {
  const lookup = machine === "apple1" ? APPLE1_COMMANDS : TRS80_COMMANDS;
  if (!currentSoftware) return lookup.default;
  return lookup[currentSoftware] ?? EMPTY_COMMAND_SET;
}

export function MachineInfo({ machine, collapsed, onToggle, onCommandClick, currentSoftware }: MachineInfoProps) {
  const info = INFO[machine];
  const { quickStart, commands } = getCommandSet(machine, currentSoftware);

  return (
    <div className="mb-3 border border-terminal-border rounded-md overflow-hidden bg-terminal-bg/50">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-1.5 text-left hover:bg-terminal-green/5 transition-colors"
      >
        <span className="text-xs text-terminal-green">
          {info.name} ({info.year})
        </span>
        <span className="text-xs text-muted-foreground">
          {collapsed ? "Show Guide" : "Hide Guide"}
          <span className="ml-1">{collapsed ? "\u25bc" : "\u25b2"}</span>
        </span>
      </button>

      {!collapsed && (
        <div className="px-3 pb-3 border-t border-terminal-border/50">
          {/* Top row: image + history side-by-side */}
          <div className="flex gap-3 pt-2">
            <div className="shrink-0 hidden sm:block">
              <Image
                src={info.image.src}
                alt={info.image.alt}
                width={140}
                height={105}
                className="rounded border border-terminal-border/50 object-cover"
                unoptimized
              />
              <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">
                {info.image.attribution}
              </p>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-foreground/80 leading-relaxed">{info.history}</p>
              {quickStart.length > 0 && (
              <ul className="mt-1.5 space-y-0.5">
                {quickStart.map((tip, i) => (
                  <li key={i} className="text-xs text-foreground/70 leading-relaxed flex gap-1.5">
                    <span className="text-terminal-green shrink-0">&gt;</span>
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
              )}
            </div>
          </div>

          {/* Commands row */}
          {commands.length > 0 && (
          <div className="mt-2 pt-2 border-t border-terminal-border/30">
            <div className="flex flex-wrap gap-x-4 gap-y-0.5">
              {commands.map(({ cmd, desc }, i) => (
                <div key={i} className="flex gap-2 items-baseline">
                  <button
                    onClick={() => onCommandClick?.(cmd)}
                    className="text-terminal-green font-mono text-[11px] whitespace-nowrap hover:bg-terminal-green/15 active:bg-terminal-green/25 px-1 -mx-1 rounded transition-colors cursor-pointer border-b border-dashed border-terminal-green/30 hover:border-terminal-green/60"
                    title={`Run: ${cmd}`}
                  >
                    {cmd}
                  </button>
                  <span className="text-muted-foreground text-[11px]">{desc}</span>
                </div>
              ))}
            </div>
          </div>
          )}
        </div>
      )}
    </div>
  );
}

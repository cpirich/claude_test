"use client";

export interface Altair8800PanelState {
  addressSwitches: number;
  dataSwitches: number;
  addressLEDs: number;
  dataLEDs: number;
  statusLEDs: number;
  running: boolean;
}

export type PanelAction =
  | "examine"
  | "examineNext"
  | "deposit"
  | "depositNext"
  | "run"
  | "stop"
  | "singleStep"
  | "reset"
  | "clr";

export interface Altair8800PanelProps {
  panelState: Altair8800PanelState;
  onToggleAddressSwitch: (bit: number) => void;
  onToggleDataSwitch: (bit: number) => void;
  onPanelAction: (action: PanelAction) => void;
}

const STATUS_LABELS = [
  "INTE",
  "MEMR",
  "INP",
  "MI",
  "OUT",
  "HLTA",
  "STACK",
  "WO",
  "INT",
];

// Octal grouping for 16 address bits (MSB first): [15] [14,13,12] [11,10,9] [8,7,6] [5,4,3] [2,1,0]
const ADDRESS_GROUPS: number[][] = [
  [15],
  [14, 13, 12],
  [11, 10, 9],
  [8, 7, 6],
  [5, 4, 3],
  [2, 1, 0],
];

// Octal grouping for 8 data bits: [7,6] [5,4,3] [2,1,0]
const DATA_GROUPS: number[][] = [[7, 6], [5, 4, 3], [2, 1, 0]];

const CONTROL_ACTIONS: { action: PanelAction; label: string }[] = [
  { action: "run", label: "RUN" },
  { action: "stop", label: "STOP" },
  { action: "singleStep", label: "SINGLE STEP" },
  { action: "examine", label: "EXAMINE" },
  { action: "examineNext", label: "EXAMINE NEXT" },
  { action: "deposit", label: "DEPOSIT" },
  { action: "depositNext", label: "DEPOSIT NEXT" },
  { action: "reset", label: "RESET" },
  { action: "clr", label: "CLR" },
];

function getBit(value: number, bit: number): boolean {
  return ((value >> bit) & 1) === 1;
}

function LED({ on, label }: { on: boolean; label: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div
        className={`w-2.5 h-2.5 rounded-full ${
          on
            ? "bg-red-500 shadow-[0_0_4px_2px_rgba(239,68,68,0.5)]"
            : "bg-red-950/80"
        }`}
        data-testid={`led-${label}`}
        role="status"
        aria-label={`${label} ${on ? "on" : "off"}`}
      />
    </div>
  );
}

function ToggleSwitch({
  on,
  onToggle,
  label,
}: {
  on: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onToggle}
      className="w-3.5 h-8 flex items-center justify-center cursor-pointer"
      data-testid={`switch-${label}`}
      aria-label={label}
      aria-pressed={on}
    >
      <div className="relative w-1.5 h-7 bg-gray-700 rounded-sm">
        <div
          className={`absolute left-1/2 -translate-x-1/2 w-3 h-3 bg-gradient-to-b from-gray-100 to-gray-400 rounded-sm border border-gray-500 transition-all duration-75 ${
            on ? "-top-0.5" : "top-4"
          }`}
        />
      </div>
    </button>
  );
}

export function Altair8800Panel({
  panelState,
  onToggleAddressSwitch,
  onToggleDataSwitch,
  onPanelAction,
}: Altair8800PanelProps) {
  const { addressSwitches, dataSwitches, addressLEDs, dataLEDs, statusLEDs, running } =
    panelState;

  const handleSwitchToggle = (bit: number) => {
    onToggleAddressSwitch(bit);
    if (bit < 8) {
      onToggleDataSwitch(bit);
    }
  };

  // Upper bits (8-15) read from addressSwitches, lower bits (0-7) from dataSwitches
  const getSwitchState = (bit: number): boolean =>
    bit >= 8 ? getBit(addressSwitches, bit) : getBit(dataSwitches, bit);

  return (
    <div
      className="altair-panel mx-auto select-none"
      style={{ width: "720px" }}
      data-testid="altair-panel"
    >
      <div className="bg-[#2a3a6b] border-2 border-[#1a2a5b] rounded-lg shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_4px_20px_rgba(0,0,0,0.5)]">
        {/* Title bar */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-[#3a4a7b]">
          <span className="text-[10px] font-bold text-blue-200 tracking-[0.25em]">
            MITS
          </span>
          <span className="text-base font-bold text-red-400 tracking-[0.4em]">
            ALTAIR 8800
          </span>
          <span className="text-[10px] text-blue-200/50 tracking-[0.2em]">
            COMPUTER
          </span>
        </div>

        {/* LED Section */}
        <div className="px-3 py-3">
          <div className="flex items-end gap-3">
            {/* Status LEDs */}
            <div className="shrink-0">
              <div className="text-[7px] text-blue-300/60 mb-1.5 tracking-wider font-bold">
                STATUS
              </div>
              <div className="flex gap-2">
                {STATUS_LABELS.map((label, i) => (
                  <div key={label} className="flex flex-col items-center gap-1">
                    <LED on={getBit(statusLEDs, i)} label={label} />
                    <span className="text-[5px] text-blue-200/40 leading-none">
                      {label}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="w-px h-6 bg-blue-400/20 shrink-0" />

            {/* WAIT / HLDA indicators */}
            <div className="shrink-0">
              <div className="flex gap-2">
                <div className="flex flex-col items-center gap-1">
                  <LED on={!running} label="WAIT" />
                  <span className="text-[5px] text-blue-200/40 leading-none">
                    WAIT
                  </span>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <LED on={running} label="HLDA" />
                  <span className="text-[5px] text-blue-200/40 leading-none">
                    HLDA
                  </span>
                </div>
              </div>
            </div>

            <div className="w-px h-6 bg-blue-400/20 shrink-0" />

            {/* Data LEDs with octal grouping */}
            <div className="shrink-0">
              <div className="text-[7px] text-blue-300/60 mb-1.5 tracking-wider font-bold">
                DATA
              </div>
              <div className="flex">
                {DATA_GROUPS.map((group, gi) => (
                  <div
                    key={gi}
                    className={`flex gap-1.5 ${gi < DATA_GROUPS.length - 1 ? "mr-2.5" : ""}`}
                    data-testid={`data-group-${gi}`}
                  >
                    {group.map((bit) => (
                      <div key={bit} className="flex flex-col items-center gap-1">
                        <LED on={getBit(dataLEDs, bit)} label={`D${bit}`} />
                        <span className="text-[5px] text-blue-200/40 leading-none">
                          D{bit}
                        </span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>

            <div className="w-px h-6 bg-blue-400/20 shrink-0" />

            {/* Address LEDs with octal grouping */}
            <div className="shrink-0">
              <div className="text-[7px] text-blue-300/60 mb-1.5 tracking-wider font-bold">
                ADDRESS
              </div>
              <div className="flex">
                {ADDRESS_GROUPS.map((group, gi) => (
                  <div
                    key={gi}
                    className={`flex gap-1 ${gi < ADDRESS_GROUPS.length - 1 ? "mr-2" : ""}`}
                    data-testid={`addr-group-${gi}`}
                  >
                    {group.map((bit) => (
                      <div key={bit} className="flex flex-col items-center gap-1">
                        <LED on={getBit(addressLEDs, bit)} label={`A${bit}`} />
                        <span className="text-[5px] text-blue-200/40 leading-none">
                          {bit}
                        </span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="mx-3 border-t border-[#3a4a7b]" />

        {/* Switch Section */}
        <div className="px-3 py-3">
          <div className="flex items-center gap-4">
            {/* Toggle Switches S15-S0 (octal grouping matches address LEDs) */}
            <div className="shrink-0">
              <div className="flex">
                {ADDRESS_GROUPS.map((group, gi) => (
                  <div
                    key={gi}
                    className={`flex gap-px ${gi < ADDRESS_GROUPS.length - 1 ? "mr-1.5" : ""}`}
                  >
                    {group.map((bit) => (
                      <div key={bit} className="flex flex-col items-center">
                        <ToggleSwitch
                          on={getSwitchState(bit)}
                          onToggle={() => handleSwitchToggle(bit)}
                          label={`S${bit}`}
                        />
                        <span className="text-[5px] text-blue-200/40 leading-none mt-0.5">
                          {bit}
                        </span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>

            <div className="w-px h-10 bg-blue-400/20 shrink-0" />

            {/* Control Switches (momentary buttons) */}
            <div className="flex flex-wrap gap-1">
              {CONTROL_ACTIONS.map(({ action, label }) => (
                <button
                  key={action}
                  onClick={() => onPanelAction(action)}
                  className="px-1.5 py-1 text-[8px] font-bold text-blue-100 bg-gray-600 hover:bg-gray-500 active:bg-gray-700 border border-gray-500 rounded-sm cursor-pointer whitespace-nowrap transition-colors"
                  data-testid={`action-${action}`}
                  aria-label={label}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

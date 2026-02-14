import { render, screen, fireEvent } from "@testing-library/react";
import { Altair8800Panel } from "../Altair8800Panel";
import type { Altair8800PanelState, PanelAction } from "../Altair8800Panel";

const defaultState: Altair8800PanelState = {
  addressSwitches: 0,
  dataSwitches: 0,
  addressLEDs: 0,
  dataLEDs: 0,
  statusLEDs: 0,
  running: false,
};

function renderPanel(
  overrides: Partial<{
    panelState: Partial<Altair8800PanelState>;
    onToggleAddressSwitch: (bit: number) => void;
    onToggleDataSwitch: (bit: number) => void;
    onPanelAction: (action: PanelAction) => void;
  }> = {}
) {
  const props = {
    panelState: { ...defaultState, ...overrides.panelState },
    onToggleAddressSwitch: overrides.onToggleAddressSwitch ?? vi.fn(),
    onToggleDataSwitch: overrides.onToggleDataSwitch ?? vi.fn(),
    onPanelAction: overrides.onPanelAction ?? vi.fn(),
  };
  return { ...render(<Altair8800Panel {...props} />), props };
}

describe("Altair8800Panel", () => {
  describe("rendering", () => {
    it("renders the panel", () => {
      renderPanel();
      expect(screen.getByTestId("altair-panel")).toBeInTheDocument();
    });

    it("renders ALTAIR 8800 title", () => {
      renderPanel();
      expect(screen.getByText("ALTAIR 8800")).toBeInTheDocument();
    });

    it("renders MITS branding", () => {
      renderPanel();
      expect(screen.getByText("MITS")).toBeInTheDocument();
    });

    it("renders COMPUTER label", () => {
      renderPanel();
      expect(screen.getByText("COMPUTER")).toBeInTheDocument();
    });
  });

  describe("status LEDs", () => {
    const statusLabels = [
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

    it("renders all status LEDs", () => {
      renderPanel();
      for (const label of statusLabels) {
        expect(screen.getByTestId(`led-${label}`)).toBeInTheDocument();
      }
    });

    it("turns on status LEDs based on statusLEDs bits", () => {
      // Set bits 0 (INTE) and 3 (MI) = 0b1001 = 9
      renderPanel({ panelState: { statusLEDs: 0b000001001 } });
      expect(screen.getByTestId("led-INTE")).toHaveAttribute(
        "aria-label",
        "INTE on"
      );
      expect(screen.getByTestId("led-MI")).toHaveAttribute(
        "aria-label",
        "MI on"
      );
      expect(screen.getByTestId("led-MEMR")).toHaveAttribute(
        "aria-label",
        "MEMR off"
      );
    });

    it("all status LEDs off when statusLEDs is 0", () => {
      renderPanel({ panelState: { statusLEDs: 0 } });
      for (const label of statusLabels) {
        expect(screen.getByTestId(`led-${label}`)).toHaveAttribute(
          "aria-label",
          `${label} off`
        );
      }
    });

    it("turns on all status LEDs when all bits set", () => {
      renderPanel({ panelState: { statusLEDs: 0x1ff } });
      for (const label of statusLabels) {
        expect(screen.getByTestId(`led-${label}`)).toHaveAttribute(
          "aria-label",
          `${label} on`
        );
      }
    });
  });

  describe("data LEDs", () => {
    it("renders all 8 data LEDs", () => {
      renderPanel();
      for (let i = 0; i < 8; i++) {
        expect(screen.getByTestId(`led-D${i}`)).toBeInTheDocument();
      }
    });

    it("lights all data LEDs when dataLEDs is 0xFF", () => {
      renderPanel({ panelState: { dataLEDs: 0xff } });
      for (let i = 0; i < 8; i++) {
        expect(screen.getByTestId(`led-D${i}`)).toHaveAttribute(
          "aria-label",
          `D${i} on`
        );
      }
    });

    it("lights specific data LEDs", () => {
      // 0b10000001 = D7 and D0 on
      renderPanel({ panelState: { dataLEDs: 0b10000001 } });
      expect(screen.getByTestId("led-D7")).toHaveAttribute(
        "aria-label",
        "D7 on"
      );
      expect(screen.getByTestId("led-D0")).toHaveAttribute(
        "aria-label",
        "D0 on"
      );
      expect(screen.getByTestId("led-D1")).toHaveAttribute(
        "aria-label",
        "D1 off"
      );
    });

    it("groups data LEDs in octal (3 groups)", () => {
      renderPanel();
      expect(screen.getByTestId("data-group-0")).toBeInTheDocument();
      expect(screen.getByTestId("data-group-1")).toBeInTheDocument();
      expect(screen.getByTestId("data-group-2")).toBeInTheDocument();
    });
  });

  describe("address LEDs", () => {
    it("renders all 16 address LEDs", () => {
      renderPanel();
      for (let i = 0; i < 16; i++) {
        expect(screen.getByTestId(`led-A${i}`)).toBeInTheDocument();
      }
    });

    it("lights all address LEDs when addressLEDs is 0xFFFF", () => {
      renderPanel({ panelState: { addressLEDs: 0xffff } });
      for (let i = 0; i < 16; i++) {
        expect(screen.getByTestId(`led-A${i}`)).toHaveAttribute(
          "aria-label",
          `A${i} on`
        );
      }
    });

    it("lights specific address LEDs", () => {
      // 0x8001 = A15 and A0 on
      renderPanel({ panelState: { addressLEDs: 0x8001 } });
      expect(screen.getByTestId("led-A15")).toHaveAttribute(
        "aria-label",
        "A15 on"
      );
      expect(screen.getByTestId("led-A0")).toHaveAttribute(
        "aria-label",
        "A0 on"
      );
      expect(screen.getByTestId("led-A1")).toHaveAttribute(
        "aria-label",
        "A1 off"
      );
    });

    it("groups address LEDs in octal (6 groups)", () => {
      renderPanel();
      for (let i = 0; i < 6; i++) {
        expect(screen.getByTestId(`addr-group-${i}`)).toBeInTheDocument();
      }
    });
  });

  describe("running indicator", () => {
    it("shows WAIT LED on when not running", () => {
      renderPanel({ panelState: { running: false } });
      expect(screen.getByTestId("led-WAIT")).toHaveAttribute(
        "aria-label",
        "WAIT on"
      );
    });

    it("shows WAIT LED off when running", () => {
      renderPanel({ panelState: { running: true } });
      expect(screen.getByTestId("led-WAIT")).toHaveAttribute(
        "aria-label",
        "WAIT off"
      );
    });

    it("shows HLDA LED on when running", () => {
      renderPanel({ panelState: { running: true } });
      expect(screen.getByTestId("led-HLDA")).toHaveAttribute(
        "aria-label",
        "HLDA on"
      );
    });

    it("shows HLDA LED off when not running", () => {
      renderPanel({ panelState: { running: false } });
      expect(screen.getByTestId("led-HLDA")).toHaveAttribute(
        "aria-label",
        "HLDA off"
      );
    });
  });

  describe("toggle switches", () => {
    it("renders all 16 toggle switches", () => {
      renderPanel();
      for (let i = 0; i < 16; i++) {
        expect(screen.getByTestId(`switch-S${i}`)).toBeInTheDocument();
      }
    });

    it("shows upper bits from addressSwitches as pressed", () => {
      renderPanel({ panelState: { addressSwitches: 0xff00 } });
      for (let i = 8; i < 16; i++) {
        expect(screen.getByTestId(`switch-S${i}`)).toHaveAttribute(
          "aria-pressed",
          "true"
        );
      }
    });

    it("shows lower bits from dataSwitches as pressed", () => {
      renderPanel({ panelState: { dataSwitches: 0xff } });
      for (let i = 0; i < 8; i++) {
        expect(screen.getByTestId(`switch-S${i}`)).toHaveAttribute(
          "aria-pressed",
          "true"
        );
      }
    });

    it("shows switches as not pressed when values are 0", () => {
      renderPanel();
      for (let i = 0; i < 16; i++) {
        expect(screen.getByTestId(`switch-S${i}`)).toHaveAttribute(
          "aria-pressed",
          "false"
        );
      }
    });

    it("calls onToggleAddressSwitch when any switch is toggled", () => {
      const onToggleAddressSwitch = vi.fn();
      renderPanel({ onToggleAddressSwitch });

      fireEvent.click(screen.getByTestId("switch-S12"));
      expect(onToggleAddressSwitch).toHaveBeenCalledWith(12);
    });

    it("calls both callbacks for lower 8 bits (S0-S7)", () => {
      const onToggleAddressSwitch = vi.fn();
      const onToggleDataSwitch = vi.fn();
      renderPanel({ onToggleAddressSwitch, onToggleDataSwitch });

      fireEvent.click(screen.getByTestId("switch-S3"));
      expect(onToggleAddressSwitch).toHaveBeenCalledWith(3);
      expect(onToggleDataSwitch).toHaveBeenCalledWith(3);
    });

    it("does not call onToggleDataSwitch for upper 8 bits (S8-S15)", () => {
      const onToggleDataSwitch = vi.fn();
      renderPanel({ onToggleDataSwitch });

      fireEvent.click(screen.getByTestId("switch-S10"));
      expect(onToggleDataSwitch).not.toHaveBeenCalled();
    });

    it("calls onToggleAddressSwitch with correct bit for S0", () => {
      const onToggleAddressSwitch = vi.fn();
      renderPanel({ onToggleAddressSwitch });

      fireEvent.click(screen.getByTestId("switch-S0"));
      expect(onToggleAddressSwitch).toHaveBeenCalledWith(0);
    });

    it("calls onToggleAddressSwitch with correct bit for S15", () => {
      const onToggleAddressSwitch = vi.fn();
      renderPanel({ onToggleAddressSwitch });

      fireEvent.click(screen.getByTestId("switch-S15"));
      expect(onToggleAddressSwitch).toHaveBeenCalledWith(15);
    });
  });

  describe("control switches", () => {
    const actions: { action: PanelAction; label: string }[] = [
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

    it("renders all control buttons", () => {
      renderPanel();
      for (const { action } of actions) {
        expect(screen.getByTestId(`action-${action}`)).toBeInTheDocument();
      }
    });

    for (const { action, label } of actions) {
      it(`fires ${action} action when ${label} is clicked`, () => {
        const onPanelAction = vi.fn();
        renderPanel({ onPanelAction });

        fireEvent.click(screen.getByTestId(`action-${action}`));
        expect(onPanelAction).toHaveBeenCalledWith(action);
        expect(onPanelAction).toHaveBeenCalledTimes(1);
      });
    }
  });

  describe("panel styling", () => {
    it("sets panel width to 720px", () => {
      renderPanel();
      const panel = screen.getByTestId("altair-panel");
      expect(panel.style.width).toBe("720px");
    });

    it("applies altair-panel class", () => {
      renderPanel();
      const panel = screen.getByTestId("altair-panel");
      expect(panel.classList.contains("altair-panel")).toBe(true);
    });
  });
});

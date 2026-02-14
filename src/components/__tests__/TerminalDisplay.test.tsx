import { render, screen, fireEvent } from "@testing-library/react";
import { TerminalDisplay } from "../TerminalDisplay";
import { trs80CharToDisplay } from "@/emulator/trs80/video";

// Mock the emulator hooks
const mockApple1State = {
  lines: Array(24).fill(" ".repeat(40)),
  cursorCol: 0,
  cursorRow: 0,
};

const mockApple1Hook = {
  state: mockApple1State,
  keyPress: vi.fn(),
  reset: vi.fn(),
  loadSoftware: vi.fn(),
  typeCommand: vi.fn(),
  emulator: { current: null },
};

vi.mock("@/hooks/useApple1", () => ({
  useApple1: () => mockApple1Hook,
}));

const mockTrs80State = {
  lines: Array(16).fill(" ".repeat(64)),
  screenCodes: Array.from({ length: 16 }, () => new Array(64).fill(0x20)),
  cursorCol: 0,
  cursorRow: 0,
};

const mockTrs80Hook = {
  state: mockTrs80State,
  onKeyDown: vi.fn(),
  onKeyUp: vi.fn(),
  reset: vi.fn(),
  loadSoftware: vi.fn(),
  typeCommand: vi.fn(),
  emulator: { current: null },
};

vi.mock("@/hooks/useTrs80", () => ({
  useTrs80: () => mockTrs80Hook,
}));

// Mock software catalogs
vi.mock("@/emulator/apple1/software-catalog", () => ({
  getFullCatalog: () => [],
}));

vi.mock("@/emulator/trs80/software-catalog", () => ({
  getTrs80FullCatalog: () => [],
}));

// Mock SoftwareLibraryModal to avoid deep rendering
vi.mock("../SoftwareLibraryModal", () => ({
  SoftwareLibraryModal: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="software-library-modal">Modal Open</div> : null,
}));

describe("TerminalDisplay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset state
    mockApple1Hook.state = { ...mockApple1State };
    mockTrs80Hook.state = { ...mockTrs80State };
  });

  describe("machine selection", () => {
    it("renders Apple I terminal for apple1 machine", () => {
      render(<TerminalDisplay machine="apple1" />);
      expect(screen.getByText("Woz Monitor")).toBeInTheDocument();
    });

    it("renders TRS-80 terminal for trs80 machine", () => {
      render(<TerminalDisplay machine="trs80" />);
      expect(screen.getByText("Stub ROM")).toBeInTheDocument();
    });
  });

  describe("Apple I terminal", () => {
    it("shows terminal dimensions", () => {
      render(<TerminalDisplay machine="apple1" />);
      expect(screen.getByText(/40.*24/)).toBeInTheDocument();
    });

    it("shows RESET button", () => {
      render(<TerminalDisplay machine="apple1" />);
      expect(screen.getByText("RESET")).toBeInTheDocument();
    });

    it("shows LOAD button", () => {
      render(<TerminalDisplay machine="apple1" />);
      expect(screen.getByText("LOAD")).toBeInTheDocument();
    });

    it("calls reset when RESET button is clicked", () => {
      render(<TerminalDisplay machine="apple1" />);
      fireEvent.click(screen.getByText("RESET"));
      expect(mockApple1Hook.reset).toHaveBeenCalledTimes(1);
    });

    it("opens software library modal when LOAD is clicked", () => {
      render(<TerminalDisplay machine="apple1" />);
      expect(screen.queryByTestId("software-library-modal")).not.toBeInTheDocument();
      fireEvent.click(screen.getByText("LOAD"));
      expect(screen.getByTestId("software-library-modal")).toBeInTheDocument();
    });

    it("renders display lines from emulator state", () => {
      const lines = Array(24).fill(" ".repeat(40));
      lines[0] = "\\".padEnd(40);
      mockApple1Hook.state = { lines, cursorCol: 0, cursorRow: 0 };

      render(<TerminalDisplay machine="apple1" />);
      expect(screen.getByText(/\\/)).toBeInTheDocument();
    });

    it("renders cursor on the correct row", () => {
      mockApple1Hook.state = {
        lines: Array(24).fill(" ".repeat(40)),
        cursorCol: 5,
        cursorRow: 3,
      };

      const { container } = render(<TerminalDisplay machine="apple1" />);
      // The cursor is a span with a background color and text-terminal-bg class
      const cursorSpans = container.querySelectorAll("span.text-terminal-bg");
      expect(cursorSpans.length).toBeGreaterThanOrEqual(1);
    });

    it("captures keyboard input", () => {
      const { container } = render(<TerminalDisplay machine="apple1" />);
      const terminalDiv = container.querySelector("[tabindex='0']");
      expect(terminalDiv).toBeTruthy();

      fireEvent.keyDown(terminalDiv!, { key: "a" });
      expect(mockApple1Hook.keyPress).toHaveBeenCalled();
    });
  });

  describe("TRS-80 terminal", () => {
    it("shows terminal dimensions", () => {
      render(<TerminalDisplay machine="trs80" />);
      expect(screen.getByText(/64.*16/)).toBeInTheDocument();
    });

    it("shows RESET button", () => {
      render(<TerminalDisplay machine="trs80" />);
      expect(screen.getByText("RESET")).toBeInTheDocument();
    });

    it("calls reset when RESET button is clicked", () => {
      render(<TerminalDisplay machine="trs80" />);
      fireEvent.click(screen.getByText("RESET"));
      expect(mockTrs80Hook.reset).toHaveBeenCalledTimes(1);
    });

    it("captures keydown events", () => {
      const { container } = render(<TerminalDisplay machine="trs80" />);
      const terminalDiv = container.querySelector("[tabindex='0']");

      fireEvent.keyDown(terminalDiv!, { key: "a" });
      expect(mockTrs80Hook.onKeyDown).toHaveBeenCalled();
    });

    it("captures keyup events", () => {
      const { container } = render(<TerminalDisplay machine="trs80" />);
      const terminalDiv = container.querySelector("[tabindex='0']");

      fireEvent.keyUp(terminalDiv!, { key: "a" });
      expect(mockTrs80Hook.onKeyUp).toHaveBeenCalled();
    });
  });

  describe("terminalRef", () => {
    it("exposes typeCommand via terminalRef for Apple I", () => {
      const terminalRef = { current: null } as React.RefObject<{ typeCommand: (cmd: string) => void } | null>;
      render(<TerminalDisplay machine="apple1" terminalRef={terminalRef} />);

      expect(terminalRef.current).not.toBeNull();
      expect(terminalRef.current!.typeCommand).toBeDefined();

      terminalRef.current!.typeCommand("FF00R");
      expect(mockApple1Hook.typeCommand).toHaveBeenCalledWith("FF00R");
    });

    it("exposes typeCommand via terminalRef for TRS-80", () => {
      const terminalRef = { current: null } as React.RefObject<{ typeCommand: (cmd: string) => void } | null>;
      render(<TerminalDisplay machine="trs80" terminalRef={terminalRef} />);

      expect(terminalRef.current).not.toBeNull();
      expect(terminalRef.current!.typeCommand).toBeDefined();

      terminalRef.current!.typeCommand("RUN");
      expect(mockTrs80Hook.typeCommand).toHaveBeenCalledWith("RUN");
    });

    it("cleans up terminalRef on unmount", () => {
      const terminalRef = { current: null } as React.RefObject<{ typeCommand: (cmd: string) => void } | null>;
      const { unmount } = render(
        <TerminalDisplay machine="apple1" terminalRef={terminalRef} />
      );
      expect(terminalRef.current).not.toBeNull();

      unmount();
      expect(terminalRef.current).toBeNull();
    });
  });

  describe("Apple I styling and layout", () => {
    it("applies apple1-screen class to container", () => {
      const { container } = render(<TerminalDisplay machine="apple1" />);
      const screenDiv = container.querySelector(".apple1-screen");
      expect(screenDiv).toBeTruthy();
    });

    it("applies apple1-terminal class to pre element", () => {
      const { container } = render(<TerminalDisplay machine="apple1" />);
      const preElement = container.querySelector("pre.apple1-terminal");
      expect(preElement).toBeTruthy();
    });

    it("sets fixed dimensions on container (720x540)", () => {
      const { container } = render(<TerminalDisplay machine="apple1" />);
      const screenDiv = container.querySelector(".apple1-screen") as HTMLElement;
      expect(screenDiv.style.width).toBe("720px");
      expect(screenDiv.style.height).toBe("540px");
    });

    it("applies transform scaling to pre element", () => {
      const { container } = render(<TerminalDisplay machine="apple1" />);
      const preElement = container.querySelector("pre.apple1-terminal") as HTMLElement;
      expect(preElement.style.transform).toMatch(/scale\(/);
    });

    it("positions pre element absolutely", () => {
      const { container } = render(<TerminalDisplay machine="apple1" />);
      const preElement = container.querySelector("pre.apple1-terminal") as HTMLElement;
      expect(preElement.style.position).toBe("absolute");
      expect(preElement.style.top).toBe("44px");
      expect(preElement.style.left).toBe("16px");
    });
  });

  describe("TRS-80 styling and layout", () => {
    it("applies trs80-screen class to container", () => {
      const { container } = render(<TerminalDisplay machine="trs80" />);
      const screenDiv = container.querySelector(".trs80-screen");
      expect(screenDiv).toBeTruthy();
    });

    it("applies trs80-terminal class to pre element", () => {
      const { container } = render(<TerminalDisplay machine="trs80" />);
      const preElement = container.querySelector("pre.trs80-terminal");
      expect(preElement).toBeTruthy();
    });

    it("sets fixed dimensions on container (720x540)", () => {
      const { container } = render(<TerminalDisplay machine="trs80" />);
      const screenDiv = container.querySelector(".trs80-screen") as HTMLElement;
      expect(screenDiv.style.width).toBe("720px");
      expect(screenDiv.style.height).toBe("540px");
    });

    it("applies transform scaling to pre element", () => {
      const { container } = render(<TerminalDisplay machine="trs80" />);
      const preElement = container.querySelector("pre.trs80-terminal") as HTMLElement;
      expect(preElement.style.transform).toMatch(/scale\(/);
    });

    it("positions pre element absolutely", () => {
      const { container } = render(<TerminalDisplay machine="trs80" />);
      const preElement = container.querySelector("pre.trs80-terminal") as HTMLElement;
      expect(preElement.style.position).toBe("absolute");
      expect(preElement.style.top).toBe("44px");
      expect(preElement.style.left).toBe("16px");
    });

    it("applies trs80-cursor class to cursor spans", () => {
      mockTrs80State.cursorRow = 0;
      mockTrs80State.cursorCol = 0;
      const { container } = render(<TerminalDisplay machine="trs80" />);
      const cursorSpans = container.querySelectorAll(".trs80-cursor");
      expect(cursorSpans.length).toBeGreaterThan(0);
    });

    it("applies white background to visible cursor", () => {
      mockTrs80State.cursorRow = 0;
      mockTrs80State.cursorCol = 0;
      const { container } = render(<TerminalDisplay machine="trs80" />);
      const visibleCursor = container.querySelector(".trs80-cursor.bg-white");
      expect(visibleCursor).toBeTruthy();
    });
  });

  describe("TRS-80 semigraphic rendering", () => {
    function makeState(codes: number[], row: number = 0) {
      const lines = Array(16).fill(" ".repeat(64));
      const screenCodes = Array.from({ length: 16 }, () => new Array(64).fill(0x20));
      // Build the display line from the codes
      lines[row] = codes.map(c => trs80CharToDisplay(c)).join("").padEnd(64);
      screenCodes[row] = [...codes, ...new Array(64 - codes.length).fill(0x20)];
      return { lines, screenCodes, cursorCol: 0, cursorRow: 15 };
    }

    it("renders semigraphic characters as spans with trs80-semigfx class", () => {
      // 0xBF = all 6 blocks lit (full block)
      mockTrs80Hook.state = makeState([0xBF, 0x20, 0xBF]);
      const { container } = render(<TerminalDisplay machine="trs80" />);
      const semigfxSpans = container.querySelectorAll(".trs80-semigfx");
      expect(semigfxSpans.length).toBe(2);
    });

    it("applies background style to non-empty semigraphic characters", () => {
      // 0x81 = only top-left block lit (bit 0)
      mockTrs80Hook.state = makeState([0x81]);
      const { container } = render(<TerminalDisplay machine="trs80" />);
      const span = container.querySelector(".trs80-semigfx") as HTMLElement;
      expect(span).toBeTruthy();
      expect(span.style.background).toContain("linear-gradient");
    });

    it("does not render semigfx spans for text-only rows", () => {
      // All standard ASCII — no semigraphic spans needed
      mockTrs80Hook.state = makeState([0x41, 0x42, 0x43]); // A B C
      const { container } = render(<TerminalDisplay machine="trs80" />);
      const semigfxSpans = container.querySelectorAll(".trs80-semigfx");
      expect(semigfxSpans.length).toBe(0);
    });

    it("renders text and semigraphics on the same row", () => {
      // Mix: 'H' (0x48), full block (0xBF), 'I' (0x49)
      mockTrs80Hook.state = makeState([0x48, 0xBF, 0x49]);
      const { container } = render(<TerminalDisplay machine="trs80" />);
      const pre = container.querySelector("pre.trs80-terminal")!;
      // Should have text content "H" and "I" plus a semigraphic span
      expect(pre.textContent).toContain("H");
      expect(pre.textContent).toContain("I");
      expect(container.querySelectorAll(".trs80-semigfx").length).toBe(1);
    });

    it("renders empty semigraphic ($80) as space without a span", () => {
      // 0x80 = empty block (all bits clear) — should render as space, not a span
      mockTrs80Hook.state = makeState([0xBF, 0x80, 0xBF]);
      const { container } = render(<TerminalDisplay machine="trs80" />);
      // Only the two non-empty semigraphics should be spans
      const semigfxSpans = container.querySelectorAll(".trs80-semigfx");
      expect(semigfxSpans.length).toBe(2);
    });
  });
});

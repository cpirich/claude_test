import { render, screen, fireEvent } from "@testing-library/react";
import { TerminalDisplay } from "../TerminalDisplay";

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
});

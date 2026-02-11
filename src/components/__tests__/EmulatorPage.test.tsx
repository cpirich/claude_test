import { render, screen, fireEvent } from "@testing-library/react";
import { EmulatorPage } from "../EmulatorPage";

// Mock next/navigation
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }),
}));

// Mock next/dynamic to render TerminalDisplay directly
vi.mock("next/dynamic", () => ({
  __esModule: true,
  default: (importFn: () => Promise<{ TerminalDisplay: React.ComponentType }>) => {
    // Return a component that renders immediately
    const Component = (props: Record<string, unknown>) => {
      return <div data-testid={`terminal-${props.machine}`}>Terminal: {String(props.machine)}</div>;
    };
    Component.displayName = "DynamicTerminalDisplay";
    return Component;
  },
}));

// Mock MachineInfo
vi.mock("@/components/MachineInfo", () => ({
  MachineInfo: ({
    machine,
    collapsed,
    onToggle,
  }: {
    machine: string;
    collapsed: boolean;
    onToggle: () => void;
  }) => (
    <div data-testid="machine-info">
      <span>Machine: {machine}</span>
      <span>Collapsed: {String(collapsed)}</span>
      <button onClick={onToggle}>Toggle Info</button>
    </div>
  ),
}));

// Mock radix tabs to use simple HTML
vi.mock("@/components/ui/tabs", () => ({
  Tabs: ({ value, onValueChange, children, ...props }: {
    value: string;
    onValueChange: (v: string) => void;
    children: React.ReactNode;
  } & Record<string, unknown>) => (
    <div data-testid="tabs" data-value={value} {...props}>
      {children}
    </div>
  ),
  TabsList: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="tabs-list">{children}</div>
  ),
  TabsTrigger: ({
    value,
    children,
  }: {
    value: string;
    children: React.ReactNode;
  }) => <button data-testid={`tab-${value}`}>{children}</button>,
  TabsContent: ({
    value,
    children,
  }: {
    value: string;
    children: React.ReactNode;
  }) => <div data-testid={`tab-content-${value}`}>{children}</div>,
}));

// Mock Badge
vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children, ...props }: { children: React.ReactNode } & Record<string, unknown>) => (
    <span data-testid="badge" {...props}>{children}</span>
  ),
}));

describe("EmulatorPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("initial rendering", () => {
    it("renders the page title", () => {
      render(<EmulatorPage initialMachine="apple1" />);
      expect(screen.getByText("Claude Microcomputer Emulator")).toBeInTheDocument();
    });

    it("renders machine tabs", () => {
      render(<EmulatorPage initialMachine="apple1" />);
      expect(screen.getByText("Apple I")).toBeInTheDocument();
      expect(screen.getByText("TRS-80 Model I")).toBeInTheDocument();
    });

    it("shows CPU spec badge for Apple I", () => {
      render(<EmulatorPage initialMachine="apple1" />);
      expect(screen.getByText(/6502 @ 1.023 MHz/)).toBeInTheDocument();
    });

    it("shows CPU spec badge for TRS-80", () => {
      render(<EmulatorPage initialMachine="trs80" />);
      expect(screen.getByText(/Z80 @ 1.774 MHz/)).toBeInTheDocument();
    });
  });

  describe("machine selection", () => {
    it("starts with the initial machine selected", () => {
      render(<EmulatorPage initialMachine="apple1" />);
      const tabs = screen.getByTestId("tabs");
      expect(tabs.getAttribute("data-value")).toBe("apple1");
    });

    it("starts with TRS-80 when initialMachine is trs80", () => {
      render(<EmulatorPage initialMachine="trs80" />);
      const tabs = screen.getByTestId("tabs");
      expect(tabs.getAttribute("data-value")).toBe("trs80");
    });
  });

  describe("MachineInfo integration", () => {
    it("passes selected machine to MachineInfo", () => {
      render(<EmulatorPage initialMachine="apple1" />);
      expect(screen.getByText("Machine: apple1")).toBeInTheDocument();
    });

    it("starts with info expanded", () => {
      render(<EmulatorPage initialMachine="apple1" />);
      expect(screen.getByText("Collapsed: false")).toBeInTheDocument();
    });

    it("toggles info collapsed state", () => {
      render(<EmulatorPage initialMachine="apple1" />);
      expect(screen.getByText("Collapsed: false")).toBeInTheDocument();

      fireEvent.click(screen.getByText("Toggle Info"));
      expect(screen.getByText("Collapsed: true")).toBeInTheDocument();

      fireEvent.click(screen.getByText("Toggle Info"));
      expect(screen.getByText("Collapsed: false")).toBeInTheDocument();
    });
  });

  describe("terminal display", () => {
    it("renders terminal for apple1", () => {
      render(<EmulatorPage initialMachine="apple1" />);
      expect(screen.getByTestId("terminal-apple1")).toBeInTheDocument();
    });

    it("renders terminal for trs80", () => {
      render(<EmulatorPage initialMachine="trs80" />);
      expect(screen.getByTestId("terminal-trs80")).toBeInTheDocument();
    });
  });
});

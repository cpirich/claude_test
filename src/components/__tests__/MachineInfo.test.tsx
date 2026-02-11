import { render, screen, fireEvent } from "@testing-library/react";
import { MachineInfo } from "../MachineInfo";

// Mock next/image to avoid <img> optimization issues in tests
vi.mock("next/image", () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...props} />;
  },
}));

describe("MachineInfo", () => {
  const defaultProps = {
    machine: "apple1" as const,
    collapsed: true,
    onToggle: vi.fn(),
    onCommandClick: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("collapsed state", () => {
    it("renders toggle button with 'Show Guide' when collapsed", () => {
      render(<MachineInfo {...defaultProps} collapsed={true} />);
      expect(screen.getByText(/Show Guide/)).toBeInTheDocument();
    });

    it("renders toggle button with 'Hide Guide' when expanded", () => {
      render(<MachineInfo {...defaultProps} collapsed={false} />);
      expect(screen.getByText(/Hide Guide/)).toBeInTheDocument();
    });

    it("does not show guide content when collapsed", () => {
      render(<MachineInfo {...defaultProps} collapsed={true} />);
      expect(screen.queryByText(/Hand-built by Steve Wozniak/)).not.toBeInTheDocument();
    });

    it("shows guide content when expanded", () => {
      render(<MachineInfo {...defaultProps} collapsed={false} />);
      expect(screen.getByText(/Hand-built by Steve Wozniak/)).toBeInTheDocument();
    });

    it("calls onToggle when toggle button is clicked", () => {
      render(<MachineInfo {...defaultProps} />);
      fireEvent.click(screen.getByText(/Show Guide/));
      expect(defaultProps.onToggle).toHaveBeenCalledTimes(1);
    });
  });

  describe("Apple I content", () => {
    it("shows 1976 year", () => {
      render(<MachineInfo {...defaultProps} collapsed={false} />);
      expect(screen.getByText(/1976/)).toBeInTheDocument();
    });

    it("shows clickable commands", () => {
      render(<MachineInfo {...defaultProps} collapsed={false} />);
      expect(screen.getByText("FF00")).toBeInTheDocument();
      expect(screen.getByText("300R")).toBeInTheDocument();
    });

    it("calls onCommandClick when a command is clicked", () => {
      render(<MachineInfo {...defaultProps} collapsed={false} />);
      fireEvent.click(screen.getByText("FF00"));
      expect(defaultProps.onCommandClick).toHaveBeenCalledWith("FF00");
    });

    it("calls onCommandClick with full command text", () => {
      render(<MachineInfo {...defaultProps} collapsed={false} />);
      fireEvent.click(screen.getByText("300: A9 01"));
      expect(defaultProps.onCommandClick).toHaveBeenCalledWith("300: A9 01");
    });
  });

  describe("TRS-80 content", () => {
    it("shows 1977 year", () => {
      render(<MachineInfo {...defaultProps} machine="trs80" collapsed={false} />);
      expect(screen.getByText(/1977/)).toBeInTheDocument();
    });

    it("shows TRS-80 history", () => {
      render(<MachineInfo {...defaultProps} machine="trs80" collapsed={false} />);
      expect(screen.getByText(/One of the first mass-produced PCs/)).toBeInTheDocument();
    });

    it("shows TRS-80 stub ROM commands", () => {
      render(<MachineInfo {...defaultProps} machine="trs80" collapsed={false} />);
      expect(screen.getByText("HELLO")).toBeInTheDocument();
      expect(screen.getByText("ABC 123")).toBeInTheDocument();
    });

    it("calls onCommandClick with TRS-80 command", () => {
      render(<MachineInfo {...defaultProps} machine="trs80" collapsed={false} />);
      fireEvent.click(screen.getByText("HELLO"));
      expect(defaultProps.onCommandClick).toHaveBeenCalledWith("HELLO");
    });
  });

  describe("without onCommandClick", () => {
    it("renders commands without crashing when onCommandClick is undefined", () => {
      render(
        <MachineInfo machine="apple1" collapsed={false} onToggle={vi.fn()} />
      );
      // Commands should still render
      expect(screen.getByText("FF00")).toBeInTheDocument();
      // Clicking should not throw
      fireEvent.click(screen.getByText("FF00"));
    });
  });
});

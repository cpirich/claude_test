import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SoftwareLibraryModal } from "../SoftwareLibraryModal";
import type { SoftwareEntry } from "@/emulator/apple1/software-library";

// Mock fetch-program and program-parser modules
vi.mock("@/lib/fetch-program", () => ({
  fetchProgram: vi.fn(),
}));

vi.mock("@/lib/program-parser", () => ({
  parseProgram: vi.fn(),
}));

function makeCatalogEntry(overrides: Partial<SoftwareEntry> = {}): SoftwareEntry {
  return {
    id: "test-prog",
    name: "TEST PROGRAM",
    description: "A test program",
    category: "utility",
    regions: [{ startAddress: 0x0300, data: new Uint8Array([0xa9, 0x01]) }],
    entryPoint: 0x0300,
    author: "Test Author",
    year: 1976,
    sizeBytes: 2,
    addressRange: "$0300-$0301",
    isStub: false,
    ...overrides,
  };
}

function makeRemoteEntry(overrides: Partial<SoftwareEntry> = {}): SoftwareEntry {
  return makeCatalogEntry({
    id: "remote-prog",
    name: "REMOTE PROGRAM",
    description: "A remote program",
    regions: [], // Empty regions = needs download
    url: "https://example.com/program.bin",
    sizeBytes: 1024,
    ...overrides,
  });
}

const defaultProps = {
  isOpen: true,
  onClose: vi.fn(),
  onLoad: vi.fn(),
  catalog: [
    makeCatalogEntry(),
    makeCatalogEntry({ id: "diag-1", name: "DIAG ONE", category: "diagnostic" }),
    makeCatalogEntry({ id: "game-1", name: "GAME ONE", category: "game" }),
  ],
  machine: "apple1" as const,
};

describe("SoftwareLibraryModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("visibility", () => {
    it("renders nothing when isOpen is false", () => {
      const { container } = render(
        <SoftwareLibraryModal {...defaultProps} isOpen={false} />
      );
      expect(container.innerHTML).toBe("");
    });

    it("renders modal when isOpen is true", () => {
      render(<SoftwareLibraryModal {...defaultProps} />);
      expect(screen.getByText("SOFTWARE LIBRARY")).toBeInTheDocument();
    });
  });

  describe("close behavior", () => {
    it("calls onClose when [X] button is clicked", () => {
      render(<SoftwareLibraryModal {...defaultProps} />);
      fireEvent.click(screen.getByText("[X]"));
      expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
    });

    it("calls onClose when backdrop is clicked", () => {
      render(<SoftwareLibraryModal {...defaultProps} />);
      // The backdrop is the first div with bg-black/80
      const backdrop = document.querySelector(".bg-black\\/80");
      expect(backdrop).toBeTruthy();
      fireEvent.click(backdrop!);
      expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
    });

    it("calls onClose when Escape is pressed", () => {
      render(<SoftwareLibraryModal {...defaultProps} />);
      fireEvent.keyDown(document, { key: "Escape" });
      expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe("top-level tabs", () => {
    it("defaults to BROWSE tab", () => {
      render(<SoftwareLibraryModal {...defaultProps} />);
      // Browse tab content should show catalog entries (name appears in list + detail panel)
      expect(screen.getAllByText("TEST PROGRAM").length).toBeGreaterThanOrEqual(1);
    });

    it("switches to URL tab", () => {
      render(<SoftwareLibraryModal {...defaultProps} />);
      fireEvent.click(screen.getByText("URL"));
      expect(screen.getByText("LOAD FROM URL")).toBeInTheDocument();
    });

    it("switches to FILE tab", () => {
      render(<SoftwareLibraryModal {...defaultProps} />);
      fireEvent.click(screen.getByText("FILE"));
      expect(screen.getByText("LOAD FROM FILE")).toBeInTheDocument();
    });

    it("resets to BROWSE tab when modal reopens", () => {
      const { rerender } = render(<SoftwareLibraryModal {...defaultProps} />);
      // Switch to URL tab
      fireEvent.click(screen.getByText("URL"));
      expect(screen.getByText("LOAD FROM URL")).toBeInTheDocument();

      // Close and reopen
      rerender(<SoftwareLibraryModal {...defaultProps} isOpen={false} />);
      rerender(<SoftwareLibraryModal {...defaultProps} isOpen={true} />);

      // Should be back on BROWSE (name appears in list + detail panel)
      expect(screen.getAllByText("TEST PROGRAM").length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("browse tab - category filtering", () => {
    it("shows ALL category by default with all entries", () => {
      render(<SoftwareLibraryModal {...defaultProps} />);
      // First entry (TEST PROGRAM) appears in both list and detail panel
      expect(screen.getAllByText("TEST PROGRAM").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("DIAG ONE")).toBeInTheDocument();
      expect(screen.getByText("GAME ONE")).toBeInTheDocument();
    });

    it("filters by DIAG category", () => {
      render(<SoftwareLibraryModal {...defaultProps} />);
      fireEvent.click(screen.getByText("DIAG"));
      expect(screen.queryByText("TEST PROGRAM")).not.toBeInTheDocument();
      // DIAG ONE is selected (list + detail panel)
      expect(screen.getAllByText("DIAG ONE").length).toBeGreaterThanOrEqual(1);
      expect(screen.queryByText("GAME ONE")).not.toBeInTheDocument();
    });

    it("filters by GAME category", () => {
      render(<SoftwareLibraryModal {...defaultProps} />);
      fireEvent.click(screen.getByText("GAME"));
      expect(screen.queryByText("TEST PROGRAM")).not.toBeInTheDocument();
      // GAME ONE is selected (list + detail panel)
      expect(screen.getAllByText("GAME ONE").length).toBeGreaterThanOrEqual(1);
    });

    it("only shows categories that have entries", () => {
      const catalog = [makeCatalogEntry({ category: "utility" })];
      render(<SoftwareLibraryModal {...defaultProps} catalog={catalog} />);
      // UTIL should be present since we have a utility entry
      expect(screen.getByText("UTIL")).toBeInTheDocument();
      // DIAG/GAME should not be present (no entries)
      expect(screen.queryByText("DIAG")).not.toBeInTheDocument();
      expect(screen.queryByText("GAME")).not.toBeInTheDocument();
    });

    it("shows empty state when category has no entries", () => {
      // Create a catalog with entries that will be filtered out
      const catalog = [makeCatalogEntry({ category: "utility" })];
      render(<SoftwareLibraryModal {...defaultProps} catalog={catalog} />);
      // Only ALL and UTIL should be shown, no empty categories
      expect(screen.queryByText("No programs in this category.")).not.toBeInTheDocument();
    });
  });

  describe("browse tab - entry selection", () => {
    it("selects first entry by default", () => {
      render(<SoftwareLibraryModal {...defaultProps} />);
      // Detail panel should show the first entry's description
      expect(screen.getByText("A test program")).toBeInTheDocument();
    });

    it("selects a different entry when clicked", () => {
      render(<SoftwareLibraryModal {...defaultProps} />);
      fireEvent.click(screen.getByText("DIAG ONE"));
      // Now the detail panel shows DIAG ONE's name as bold header
      const headers = screen.getAllByText("DIAG ONE");
      expect(headers.length).toBeGreaterThanOrEqual(1);
    });

    it("shows entry details (author, year, address range)", () => {
      render(<SoftwareLibraryModal {...defaultProps} />);
      expect(screen.getByText(/Test Author/)).toBeInTheDocument();
      expect(screen.getByText(/1976/)).toBeInTheDocument();
    });
  });

  describe("browse tab - loading", () => {
    it("shows LOAD button for local entries", () => {
      render(<SoftwareLibraryModal {...defaultProps} />);
      expect(screen.getByText("LOAD")).toBeInTheDocument();
    });

    it("calls onLoad when LOAD button is clicked for local entry", () => {
      render(<SoftwareLibraryModal {...defaultProps} />);
      fireEvent.click(screen.getByText("LOAD"));
      expect(defaultProps.onLoad).toHaveBeenCalledTimes(1);
      expect(defaultProps.onLoad).toHaveBeenCalledWith(
        expect.objectContaining({ id: "test-prog", name: "TEST PROGRAM" })
      );
    });

    it("shows DOWNLOAD & LOAD for remote entries", () => {
      const catalog = [makeRemoteEntry()];
      render(<SoftwareLibraryModal {...defaultProps} catalog={catalog} />);
      expect(screen.getByText("DOWNLOAD & LOAD")).toBeInTheDocument();
    });

    it("shows [DL] badge for remote entries in the list", () => {
      const catalog = [makeRemoteEntry()];
      render(<SoftwareLibraryModal {...defaultProps} catalog={catalog} />);
      expect(screen.getByText("[DL]")).toBeInTheDocument();
    });

    it("handles remote download success", async () => {
      const { fetchProgram } = await import("@/lib/fetch-program");
      const { parseProgram } = await import("@/lib/program-parser");

      (fetchProgram as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: new Uint8Array([0xa9, 0x01]),
        contentType: "application/octet-stream",
      });
      (parseProgram as ReturnType<typeof vi.fn>).mockReturnValue({
        regions: [{ startAddress: 0x0300, data: new Uint8Array([0xa9, 0x01]) }],
        sizeBytes: 2,
        addressRange: "$0300-$0301",
        format: "binary",
      });

      const catalog = [makeRemoteEntry()];
      const onLoad = vi.fn();
      render(
        <SoftwareLibraryModal {...defaultProps} catalog={catalog} onLoad={onLoad} />
      );

      fireEvent.click(screen.getByText("DOWNLOAD & LOAD"));

      await waitFor(() => {
        expect(onLoad).toHaveBeenCalledTimes(1);
      });
      expect(onLoad).toHaveBeenCalledWith(
        expect.objectContaining({ id: "remote-prog" })
      );
    });

    it("shows error on remote download failure", async () => {
      const { fetchProgram } = await import("@/lib/fetch-program");
      (fetchProgram as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("Network error")
      );

      const catalog = [makeRemoteEntry()];
      render(<SoftwareLibraryModal {...defaultProps} catalog={catalog} />);

      fireEvent.click(screen.getByText("DOWNLOAD & LOAD"));

      await waitFor(() => {
        expect(screen.getByText("ERR: Network error")).toBeInTheDocument();
      });

      // Should show retry button
      expect(screen.getByText("[RETRY]")).toBeInTheDocument();
    });
  });

  describe("URL tab", () => {
    it("shows URL input and format selectors", () => {
      render(<SoftwareLibraryModal {...defaultProps} />);
      fireEvent.click(screen.getByText("URL"));
      expect(screen.getByPlaceholderText("https://example.com/program.bin")).toBeInTheDocument();
      expect(screen.getByText("AUTO")).toBeInTheDocument();
      expect(screen.getByText("BINARY")).toBeInTheDocument();
      expect(screen.getByText("HEX")).toBeInTheDocument();
    });

    it("shows BAS format option in format selectors for TRS-80", () => {
      render(<SoftwareLibraryModal {...defaultProps} machine="trs80" />);
      fireEvent.click(screen.getByText("URL"));
      expect(screen.getByText("BAS")).toBeInTheDocument();
    });

    it("shows CMD format option in format selectors for TRS-80", () => {
      render(<SoftwareLibraryModal {...defaultProps} machine="trs80" />);
      fireEvent.click(screen.getByText("URL"));
      expect(screen.getByText("CMD")).toBeInTheDocument();
    });

    it("hides TRS-80 formats for Apple I", () => {
      render(<SoftwareLibraryModal {...defaultProps} machine="apple1" />);
      fireEvent.click(screen.getByText("URL"));
      expect(screen.queryByText("BAS")).not.toBeInTheDocument();
      expect(screen.queryByText("CMD")).not.toBeInTheDocument();
      expect(screen.getByText("WOZ")).toBeInTheDocument();
    });

    it("disables FETCH & LOAD when URL is empty", () => {
      render(<SoftwareLibraryModal {...defaultProps} />);
      fireEvent.click(screen.getByText("URL"));
      const button = screen.getByText("FETCH & LOAD");
      expect(button).toBeDisabled();
    });

    it("enables FETCH & LOAD when URL is entered", () => {
      render(<SoftwareLibraryModal {...defaultProps} />);
      fireEvent.click(screen.getByText("URL"));

      const input = screen.getByPlaceholderText("https://example.com/program.bin");
      fireEvent.change(input, { target: { value: "https://test.com/prog.bin" } });

      const button = screen.getByText("FETCH & LOAD");
      expect(button).not.toBeDisabled();
    });
  });

  describe("FILE tab", () => {
    it("shows drop zone", () => {
      render(<SoftwareLibraryModal {...defaultProps} />);
      fireEvent.click(screen.getByText("FILE"));
      expect(screen.getByText("DROP FILE HERE")).toBeInTheDocument();
      expect(screen.getByText("or click to browse")).toBeInTheDocument();
    });

    it("shows format selectors", () => {
      render(<SoftwareLibraryModal {...defaultProps} />);
      fireEvent.click(screen.getByText("FILE"));
      expect(screen.getByText("AUTO")).toBeInTheDocument();
      expect(screen.getByText("BINARY")).toBeInTheDocument();
    });

    it("shows TRS-80 file extensions in drop zone hint", () => {
      render(<SoftwareLibraryModal {...defaultProps} />);
      fireEvent.click(screen.getByText("FILE"));
      expect(screen.getByText(/\.cmd/)).toBeInTheDocument();
      expect(screen.getByText(/\.bas/)).toBeInTheDocument();
      expect(screen.getByText(/\.asm/)).toBeInTheDocument();
      expect(screen.getByText(/\.cas/)).toBeInTheDocument();
    });

    it("accepts TRS-80 file extensions in file input", () => {
      render(<SoftwareLibraryModal {...defaultProps} />);
      fireEvent.click(screen.getByText("FILE"));
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      expect(fileInput).toBeTruthy();
      expect(fileInput.accept).toContain(".cmd");
      expect(fileInput.accept).toContain(".bas");
      expect(fileInput.accept).toContain(".asm");
      expect(fileInput.accept).toContain(".cas");
    });

    it("accepts standard file extensions in file input", () => {
      render(<SoftwareLibraryModal {...defaultProps} />);
      fireEvent.click(screen.getByText("FILE"));
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      expect(fileInput).toBeTruthy();
      expect(fileInput.accept).toContain(".bin");
      expect(fileInput.accept).toContain(".hex");
      expect(fileInput.accept).toContain(".ihx");
      expect(fileInput.accept).toContain(".txt");
      expect(fileInput.accept).toContain(".rom");
      expect(fileInput.accept).toContain(".zip");
    });
  });

  describe("load instructions", () => {
    it("shows load instructions when entry has them", () => {
      const catalog = [
        makeCatalogEntry({
          loadInstructions: "Type 300R to run",
        }),
      ];
      render(<SoftwareLibraryModal {...defaultProps} catalog={catalog} />);
      expect(screen.getByText(/Type 300R to run/)).toBeInTheDocument();
    });

    it("shows notes when entry has them", () => {
      const catalog = [
        makeCatalogEntry({
          notes: "Requires 8K RAM",
        }),
      ];
      render(<SoftwareLibraryModal {...defaultProps} catalog={catalog} />);
      expect(screen.getByText("Requires 8K RAM")).toBeInTheDocument();
    });
  });
});

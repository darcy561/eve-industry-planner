import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";

const useArchivedJobsQuery = vi.fn();

vi.mock("../../Hooks/React Query/Backend/archivedJobsList", () => ({
  useArchivedJobsQuery: (...args) => useArchivedJobsQuery(...args),
  invalidateArchiveQueries: vi.fn(),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal()),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

const { ArchivedJobsList } = await import("./ArchivedJobsList.jsx");

// useMediaQuery reads the breakpoints off the theme, so one has to be in context.
const theme = createTheme();
function renderList(props) {
  return render(
    <ThemeProvider theme={theme}>
      <ArchivedJobsList {...props} />
    </ThemeProvider>,
  );
}

/** matchMedia reports false by default, which is the narrow layout. */
function setWide(isWide) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: isWide,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

const jobs = [
  {
    jobID: "job-a",
    name: "Rifter",
    archivedAt: "2026-08-21T00:00:00Z",
    measures: {
      jobCostTotal: 1000,
      profitLoss: 250,
      segment: "standaloneRecordedSale",
    },
  },
];

beforeEach(() => {
  useArchivedJobsQuery.mockReset();
  useArchivedJobsQuery.mockReturnValue({
    data: { jobs, paging: { totalJobs: 1 } },
    isLoading: false,
    isError: false,
  });
});

describe("ArchivedJobsList", () => {
  // Six columns cannot be read on a phone, and scrolling them sideways hides the
  // figures behind the name.
  it("uses cards on a narrow screen", () => {
    setWide(false);
    const { container } = renderList();

    expect(container.querySelector("table")).toBeNull();
    // The card carries its own labels, since there is no header row above it.
    expect(screen.getAllByText("Job cost").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Profit / loss").length).toBeGreaterThan(0);
  });

  it("uses the table on a wide screen", () => {
    setWide(true);
    const { container } = renderList();

    expect(container.querySelector("table")).not.toBeNull();
  });

  // The list is not queried until the tab holding it is opened.
  it("stays disabled until enabled", () => {
    setWide(true);
    renderList({ enabled: false });

    expect(useArchivedJobsQuery.mock.calls[0][1]).toMatchObject({
      enabled: false,
    });
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const useAccountTimelineQuery = vi.fn();

vi.mock("../../Hooks/React Query/Backend/statisticsTimeline", () => ({
  useAccountTimelineQuery: (...args) => useAccountTimelineQuery(...args),
}));

const { ArchivedStatsOverview } = await import("./ArchivedStatsOverview.jsx");

function month(overrides) {
  return { year: 2026, month: 8, complete: false, ...overrides };
}

beforeEach(() => {
  useAccountTimelineQuery.mockReset();
});

describe("ArchivedStatsOverview", () => {
  it("labels the figures as month-to-date", () => {
    useAccountTimelineQuery.mockReturnValue({
      data: { months: [] },
      isLoading: false,
    });

    render(<ArchivedStatsOverview />);

    expect(screen.getByText("So far this month")).toBeInTheDocument();
  });

  // The server returns months ascending, so the month in progress is last. Taking
  // index 0 as "current" would compare last month against itself once the window
  // ever widens.
  it("reads the current month from the end of the list", () => {
    useAccountTimelineQuery.mockReturnValue({
      data: {
        months: [
          month({ month: 7, complete: true, salesTotal: 100 }),
          month({ month: 8, salesTotal: 250 }),
        ],
      },
      isLoading: false,
    });

    render(<ArchivedStatsOverview />);

    expect(screen.getByText("250.00")).toBeInTheDocument();
    expect(screen.getByText("Last month: 100.00")).toBeInTheDocument();
  });

  // An account in its first month has one entry. Treating it as the previous
  // month would compare the month against itself and always report no change.
  it("compares against zero when there is no previous month", () => {
    useAccountTimelineQuery.mockReturnValue({
      data: { months: [month({ salesTotal: 500 })] },
      isLoading: false,
    });

    render(<ArchivedStatsOverview />);

    expect(screen.getByText("500.00")).toBeInTheDocument();
    expect(screen.getAllByText("Last month: 0.00").length).toBeGreaterThan(0);
  });

  // jobCostTotal already contains both fee totals, confirmed against production
  // data. Adding the fees again would overstate spend on every account.
  it("takes spend from jobCostTotal without re-adding the fees", () => {
    useAccountTimelineQuery.mockReturnValue({
      data: {
        months: [
          month({ month: 7, complete: true, jobCostTotal: 1000 }),
          month({
            month: 8,
            jobCostTotal: 1080,
            brokersFeeTotal: 30,
            transactionFeeTotal: 50,
          }),
        ],
      },
      isLoading: false,
    });

    render(<ArchivedStatsOverview />);

    // 1080, not 1160.
    expect(screen.getByText("1,080.00")).toBeInTheDocument();
    expect(screen.queryByText("1,160.00")).not.toBeInTheDocument();
  });

  it("shows a placeholder while loading rather than zeroes", () => {
    useAccountTimelineQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
    });

    const { container } = render(<ArchivedStatsOverview />);

    // Zeroes would read as a real month with no activity.
    expect(screen.queryByText("0.00")).not.toBeInTheDocument();
    expect(
      container.querySelectorAll(".MuiSkeleton-root").length,
    ).toBeGreaterThan(0);
  });

  it("renders a card for each measure", () => {
    useAccountTimelineQuery.mockReturnValue({
      data: { months: [month({ salesTotal: 1 })] },
      isLoading: false,
    });

    render(<ArchivedStatsOverview />);

    expect(screen.getByText("Amount Spent")).toBeInTheDocument();
    expect(screen.getByText("Amount Received")).toBeInTheDocument();
    expect(screen.getByText("Profit / Loss")).toBeInTheDocument();
  });

  // Reads the window the server chooses, which is the current month and the one
  // before it. Passing a range would pin the dashboard to a fixed window.
  it("asks for the default window", () => {
    useAccountTimelineQuery.mockReturnValue({
      data: { months: [] },
      isLoading: false,
    });

    render(<ArchivedStatsOverview />);

    // No range means the server picks the window, which is what this view wants.
    const options = useAccountTimelineQuery.mock.calls[0]?.[0] ?? {};
    expect(options.from).toBeUndefined();
    expect(options.to).toBeUndefined();
  });

  // A caller with its own range control passes one, so the cards agree with the
  // rest of that page rather than showing the server's default window.
  it("passes a caller's range through", () => {
    useAccountTimelineQuery.mockReturnValue({
      data: { months: [] },
      isLoading: false,
    });

    render(<ArchivedStatsOverview from="2026-01" to="2026-06" />);

    expect(useAccountTimelineQuery.mock.calls[0][0]).toMatchObject({
      from: "2026-01",
      to: "2026-06",
    });
  });
});

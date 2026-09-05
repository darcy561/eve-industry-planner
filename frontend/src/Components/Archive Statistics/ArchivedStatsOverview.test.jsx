import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";

const useAccountTimelineQuery = vi.fn();

vi.mock("../../Hooks/React Query/Backend/statisticsTimeline", () => ({
  useAccountTimelineQuery: (...args) => useAccountTimelineQuery(...args),
}));

const { ArchivedStatsOverview } = await import("./ArchivedStatsOverview.jsx");

function month(overrides) {
  return { year: 2026, month: 8, complete: false, ...overrides };
}

// The comparison is against the calendar, so the clock is part of the fixture.
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-15T00:00:00Z"));
  useAccountTimelineQuery.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
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

  it("reads this month and the one before it", () => {
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

  // Early in a month nothing has been archived into it yet, so the newest row
  // the server returns is last month's. Reading the end of the list showed those
  // figures as this month's, with nothing to compare them against.
  it("shows nothing for a month with no rows yet, and last month beside it", () => {
    vi.setSystemTime(new Date("2026-09-02T00:00:00Z"));
    useAccountTimelineQuery.mockReturnValue({
      data: { months: [month({ month: 8, complete: true, salesTotal: 250 })] },
      isLoading: false,
    });

    render(<ArchivedStatsOverview />);

    expect(screen.getByText("Last month: 250.00")).toBeInTheDocument();
    // Three measures, all of them nothing so far this month.
    expect(screen.getAllByText("0.00")).toHaveLength(3);
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

  // A timeline month keeps the two selling fees outside jobCostTotal and takes
  // them off profit separately — checked against every bucket in development
  // that carries a fee, all of which satisfy
  // profit == sales - brokers - tax - jobCostTotal. The lifetime totals row
  // spells the same field the other way, fees included, which is what makes this
  // easy to get backwards.
  it("counts the selling fees as money spent", () => {
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

    // 1160, not 1080: without the fees the three cards stop adding up, and
    // received minus spent reads larger than the profit beside it.
    expect(screen.getByText("1,160.00")).toBeInTheDocument();
    expect(screen.queryByText("1,080.00")).not.toBeInTheDocument();
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

  // The card says "so far this month", so it is the one thing on the page the
  // period control does not move. A window ending in the past would otherwise
  // leave it comparing two historical months under that heading.
  it("compares this month against last whatever period the page is showing", () => {
    useAccountTimelineQuery.mockReturnValue({
      data: {
        months: [
          month({ month: 6, complete: true, salesTotal: 100 }),
          month({ month: 7, complete: true, salesTotal: 200 }),
          month({ month: 8, salesTotal: 250 }),
        ],
      },
      isLoading: false,
    });

    render(<ArchivedStatsOverview />);

    // No window of its own: the server's default is this month and the one
    // before, which is exactly what the comparison is.
    expect(useAccountTimelineQuery.mock.calls[0][0]).toEqual({});
    // The two most recent months, not the two at the end of some window.
    expect(screen.getByText("250.00")).toBeInTheDocument();
    expect(screen.getAllByText("Last month: 200.00").length).toBeGreaterThan(0);
  });
});

// A figure and a comparison are two statements, and only one of them has a good
// and a bad side of zero.
describe("what the figures are, against how they compare", () => {
  function render2Months(current, previous) {
    useAccountTimelineQuery.mockReturnValue({
      data: {
        months: [
          month({ month: 7, complete: true, ...previous }),
          month({ month: 8, ...current }),
        ],
      },
      isLoading: false,
    });
    return render(<ArchivedStatsOverview />);
  }

  function figure(text) {
    return screen.getByText(text);
  }

  it("shows a profit as a profit even when it trails last month", () => {
    render2Months({ profitLoss: 416_426_124.5 }, { profitLoss: 1_172_577_352.98 });

    // Down on the month, so the comparison is unfavourable...
    expect(figure("-64.5%")).toBeInTheDocument();
    // ...but the account is still in profit, and the figure says so.
    const value = figure("416,426,124.50");
    expect(value.className).not.toMatch(/error/i);
  });

  it("shows a loss as a loss", () => {
    render2Months({ profitLoss: -5000 }, { profitLoss: -1000 });

    expect(figure("-5,000.00")).toBeInTheDocument();
  });

  // Spending more is not "bad" the way a loss is bad; it is a size, not a
  // verdict, so the figure itself stays neutral.
  it("leaves spend and receipts uncoloured by their own sign", () => {
    render2Months({ jobCostTotal: 100 }, { jobCostTotal: 10 });

    const value = figure("100.00");
    expect(value.className).not.toMatch(/success|error/i);
  });

  // The three cards are meant to be read together, so they have to add up.
  it("leaves received minus spent equal to the profit beside it", () => {
    render2Months(
      {
        jobCostTotal: 600,
        brokersFeeTotal: 30,
        transactionFeeTotal: 20,
        salesTotal: 1000,
        profitLoss: 350,
      },
      {},
    );

    expect(figure("650.00")).toBeInTheDocument();
    expect(figure("1,000.00")).toBeInTheDocument();
    expect(figure("350.00")).toBeInTheDocument();
  });
});

import { render, waitFor } from "@testing-library/react";
import { expect, vi } from "vitest";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { LocalizationProvider } from "@mui/x-date-pickers";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * Shared pieces for rendering an archive page against faked transport.
 *
 * Integration tests here run the real components, hooks and adapters and fake
 * only what leaves the browser, so what they share is setup rather than
 * assertions. Each test still declares its own `vi.mock` calls — those are
 * hoisted per file — but the bodies come from here.
 */

const theme = createTheme();

/**
 * Store state an archive view expects to find.
 *
 * The locale matters: number formatting reads it, and without it a panel throws
 * mid-render and falls back to something that still looks plausible.
 *
 * @param {Object} [overrides]
 */
export function archiveStoreState(overrides = {}) {
  return {
    account: { isLoggedIn: true, accountID: "acct-1" },
    applicationSettings: {
      extrasCategories: [],
      actions: { getCurrentLocale: () => "en-GB" },
    },
    // A restore applies its own result to the planner store, so the actions it
    // reaches for have to be there even for a view that never restores.
    jobData: {
      groupArray: [],
      actions: {
        updateOrAddJobsToJobArray: vi.fn(),
        addGroupToGroupArray: vi.fn(),
        updateModifiedGroups: vi.fn(),
      },
    },
    ...overrides,
  };
}

/** The users store as a component tree sees it. */
export function usersStoreMock(state = archiveStoreState()) {
  return {
    default: Object.assign((selector) => selector(state), {
      getState: () => state,
    }),
  };
}

/**
 * What each chart was last handed, keyed by the series it draws.
 *
 * jsdom performs no layout, so a real chart renders no marks to assert on. The
 * rows reaching it are the output of every hook and adapter above, which is what
 * an integration test is actually about.
 */
export const chartCapture = new Map();

/**
 * Every set of props a chart was rendered with, newest last.
 *
 * `chartCapture` answers what was drawn; this answers how a panel asked for it —
 * the series, the category key and the formatter, which is the panel's own half
 * of the contract with the primitive.
 */
export const chartRenders = [];

/** Chart module stubs that record their rows. Pass to `vi.mock` as the factory. */
export function chartMocks() {
  const record = (kind, props) => {
    chartRenders.push({ kind, ...props });
  };
  return {
    TimeSeriesChart: (props) => {
      chartCapture.set(props.series.map((s) => s.key).join(","), props.rows);
      record("time", props);
      return <div data-testid="chart" />;
    },
    RankedBarChart: (props) => {
      record("ranked", props);
      return <div data-testid="ranked" />;
    },
    PieChart: (props) => {
      record("pie", props);
      return <div data-testid="pie" />;
    },
  };
}

/** The most recent render of one chart kind. */
export function lastChart(kind) {
  return [...chartRenders].reverse().find((c) => c.kind === kind);
}

/** Distinct row counts across every chart's latest render. */
export function drawnRowCounts() {
  return [...new Set([...chartCapture.values()].map((rows) => rows.length))].sort(
    (a, b) => a - b,
  );
}

/** Waits until every chart has drawn the same, expected, number of rows. */
export async function settledOn(count) {
  await waitFor(() => expect(drawnRowCounts()).toEqual([count]));
}

/**
 * Renders with a theme only, for a view that owns no queries.
 *
 * `useMediaQuery` reads breakpoints off the theme, so one has to be in context
 * even where nothing is fetched.
 */
export function renderWithTheme(ui) {
  return render(<ThemeProvider theme={theme}>{withPickers(ui)}</ThemeProvider>);
}

/**
 * The date pickers read their adapter from context, which `AppWrapper` provides
 * for the whole app — so a view holding one renders only inside it.
 */
function withPickers(ui) {
  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>{ui}</LocalizationProvider>
  );
}

/**
 * Points `matchMedia` at a width. It reports false by default, which reads as the
 * narrow layout, so a table test that does not set this is testing the cards.
 */
export function setViewportWide(isWide) {
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

/** Renders with the providers an archive view needs. */
export function renderWithProviders(ui) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ThemeProvider theme={theme}>{withPickers(ui)}</ThemeProvider>
    </QueryClientProvider>,
  );
}

/** One calendar month, as a timeline read returns it. */
export function monthRow(year, month, overrides = {}) {
  return {
    year,
    month,
    complete: true,
    quantityProduced: 10,
    quantitySold: 5,
    salesTotal: 1000,
    jobCostTotal: 400,
    materialCostTotal: 300,
    installCostTotal: 50,
    inventionCostTotal: 30,
    extrasTotal: 20,
    brokersFeeTotal: 10,
    transactionFeeTotal: 5,
    profitLoss: 585,
    ...overrides,
  };
}

/** Every month of the given years, ascending, as the server returns them. */
export function monthsAcross(...years) {
  const out = [];
  for (const year of years) {
    for (let m = 1; m <= 12; m += 1) out.push(monthRow(year, m));
  }
  return out;
}

/** A timeline response covering everything it was given. */
export function timelineResponse(months) {
  return { period: { from: "", to: "", all: true }, totals: {}, months };
}

/**
 * The static data files, as a module mock. Every reader is stubbed, so a hook
 * that starts reading a second file does not break each test that mocks this.
 */
export function cachedDataMock(overrides = {}) {
  return {
    getFullItemList: vi.fn(async () => ({})),
    getSearchIndex: vi.fn(async () => []),
    getReprocessingData: vi.fn(async () => ({})),
    getRecipeListFromCache: vi.fn(async () => ({})),
    ...overrides,
  };
}

/** Endpoint stubs shared by the archive views. */
export function emptyArchiveListMock() {
  return {
    getArchivedJobs: vi.fn(async () => ({ jobs: [], paging: { totalJobs: 0 } })),
    getArchivedJob: vi.fn(async () => null),
    restoreArchivedJobs: vi.fn(async () => null),
    fileArchivedJobMonths: vi.fn(async () => ({ jobIDs: [] })),
    // The real values: a test that asserts which scope was asked for is
    // asserting against the module's own vocabulary, not a copy of it.
    RESTORE_SCOPES: { JOB: "job", GROUP: "group", RELATED: "related" },
  };
}

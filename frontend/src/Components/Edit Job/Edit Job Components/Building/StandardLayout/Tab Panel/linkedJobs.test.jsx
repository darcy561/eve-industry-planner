import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";

vi.mock("../../../../../../Zustand/usersStore", async () => {
  const { usersStoreOverSession } =
    await import("../../../../../../tests/usersStoreHarness.js");
  return usersStoreOverSession();
});

vi.mock("../../../../Edit Job Hooks/useActiveJobDocumentLock", () => ({
  useActiveJobReadOnly: () => false,
}));

vi.mock("../../../../../../Hooks/EveEsi/useLocationNames", () => ({
  default: () => ({ names: {} }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ getQueryData: () => undefined }),
  QueryClient: class {},
}));

const { LinkedJobsTab } = await import("./linkedJobs.jsx");
const { default: useUsersStore } =
  await import("../../../../../../Zustand/usersStore");

const theme = createTheme();
const session = () => useUsersStore.getState().editSession;

const NOW = Date.parse("2026-06-01T12:00:00Z");
const hoursFromNow = (hours) =>
  new Date(NOW + hours * 3600 * 1000).toISOString();

/** A run the job holds, as the document stores one. */
const aRun = (overrides) => ({
  job_id: 700,
  runs: 3,
  status: "active",
  cost: 1000,
  blueprint_id: 1,
  station_id: 60003760,
  start_date: hoursFromNow(-10),
  end_date: hoursFromNow(5),
  ...overrides,
});

const openJob = (run = aRun()) =>
  session().actions.openJob("job-1", {
    jobID: "job-1",
    build: {},
    esi: {
      industryJobs: { [run.job_id]: run },
      marketOrders: {},
      transactions: {},
    },
  });

const show = () =>
  render(
    <ThemeProvider theme={theme}>
      <LinkedJobsTab isLoading={false} isError={false} />
    </ThemeProvider>,
  );

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(NOW);
  session().actions.closeSession();
});

describe("the runs already linked to the job", () => {
  // The dates are the job's own, read as stored data. Read through anything
  // that expects the class, the countdown reads "Invalid input time" and the
  // run never turns ready however long it has been over.
  it("counts down what is left of a run", () => {
    openJob();

    show();

    // What is left of it, in whatever words the duration is put — the point is
    // that the dates were read at all.
    expect(screen.queryByText(/Invalid input time/)).toBeNull();
    expect(screen.queryByText(/Complete/)).toBeNull();
    expect(screen.getByText(/5H/)).toBeInTheDocument();
  });

  it("says a run whose time is up is ready to deliver", () => {
    openJob(aRun({ end_date: hoursFromNow(-1) }));

    show();

    expect(screen.getByText(/Ready for Delivery/)).toBeInTheDocument();
  });

  it("leaves a run still going as it is", () => {
    openJob();

    show();

    expect(screen.queryByText(/Ready for Delivery/)).toBeNull();
  });
});

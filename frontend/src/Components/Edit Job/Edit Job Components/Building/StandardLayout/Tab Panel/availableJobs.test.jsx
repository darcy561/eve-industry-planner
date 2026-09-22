import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";

const { BUILDER } = vi.hoisted(() => ({ BUILDER: 95465499 }));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({}),
}));

vi.mock("../../../../../../Zustand/usersStore", async () => {
  const { usersStoreOverSession } =
    await import("../../../../../../tests/usersStoreHarness.js");
  return usersStoreOverSession({
    // A row names whoever installed the run, and one whose installer this
    // account cannot name is not offered at all.
    account: {
      actions: {
        findCharacterById: (characterID) =>
          characterID === BUILDER
            ? { CharacterID: BUILDER, CharacterName: "Builder" }
            : null,
      },
    },
  });
});

// This file is about a job's clock and status, not about resolving places: the names arrive
// already resolved so the rows render without the query layer this mock has replaced.
vi.mock("../../../../../../Hooks/EveEsi/useLocationNames", () => ({
  default: () => ({
    names: { 60003760: { name: "Jita IV - Moon 4" } },
    isLoading: false,
    isError: false,
    error: null,
  }),
}));

vi.mock("../../../../../../Functions/Shared/findBlueprintType", () => ({
  default: () => "Manufacturing",
}));

vi.mock("../../../../Edit Job Hooks/useActiveJobDocumentLock", () => ({
  useActiveJobReadOnly: () => false,
}));

vi.mock("../../../../panelStates", () => ({
  default: ({ children }) => children,
}));

const { AvailableJobsTab } = await import("./availableJobs.jsx");
const { default: useUsersStore } =
  await import("../../../../../../Zustand/usersStore");
const { jobDraftNow } =
  await import("../../../../Edit Job Hooks/useJobDraft.js");

const session = () => useUsersStore.getState().editSession;

const HOUR = 60 * 60 * 1000;
const START = Date.parse("2026-01-01T00:00:00.000Z");

function esiJob(overrides = {}) {
  return {
    job_id: 1,
    installer_id: BUILDER,
    blueprint_id: 1000000000001,
    facility_id: 60003760,
    status: "active",
    start_date: new Date(START).toISOString(),
    end_date: new Date(START + HOUR).toISOString(),
    runs: 1,
    ...overrides,
  };
}

/** A job with ten slots and nothing linked, so every match is offered. */
function openJob() {
  session().actions.openJob("job-1", {
    jobID: "job-1",
    build: {
      setup: { "setup-1": { id: "setup-1", runCount: 1, jobCount: 10 } },
    },
    esi: { industryJobs: {}, marketOrders: {}, transactions: {} },
  });
}

function renderTab(jobs) {
  openJob();
  return render(
    <AvailableJobsTab
      jobMatches={jobs}
      isLoading={false}
      isError={false}
      error={null}
    />,
  );
}

beforeEach(() => {
  session().actions.closeSession();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(START));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("AvailableJobsTab", () => {
  it("shows an unfinished job as still running", () => {
    renderTab([esiJob()]);

    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.queryByText("Ready for Delivery")).not.toBeInTheDocument();
  });

  it("shows a job that was already finished as ready", () => {
    vi.setSystemTime(new Date(START + 2 * HOUR));

    renderTab([esiJob()]);

    expect(screen.getByText("Ready for Delivery")).toBeInTheDocument();
  });

  // The defect this covers: the card read the clock once while it rendered and
  // nothing re-rendered it, so a job that finished while the tab was open kept
  // its stale countdown and its amber "Active" chip.
  it("turns ready while the tab is open and the job finishes", async () => {
    renderTab([esiJob()]);

    expect(screen.getByText("Active")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(HOUR + 60_000);
    });

    expect(screen.getByText("Ready for Delivery")).toBeInTheDocument();
    expect(screen.queryByText("Active")).not.toBeInTheDocument();
  });

  // "Link all" walks the matches rather than the rows, and a row whose
  // installer this account cannot name is not drawn at all — so without a
  // filter of its own it linked runs naming nobody, and said it had linked
  // more than it did.
  it("links only the runs it can name, and counts those", () => {
    renderTab([esiJob(), esiJob({ job_id: 2, installer_id: 90000001 })]);

    fireEvent.click(screen.getByRole("button", { name: /Link All Jobs/i }));

    expect(Object.keys(jobDraftNow().esi.industryJobs)).toEqual(["1"]);
    expect(session().esiDataToLink.industryJobs.add).toEqual([1]);
  });

  it("leaves a delivered job alone as the clock runs", async () => {
    renderTab([esiJob({ status: "delivered" })]);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2 * HOUR);
    });

    expect(screen.getByText("Delivered")).toBeInTheDocument();
    expect(screen.queryByText("Ready for Delivery")).not.toBeInTheDocument();
  });
});

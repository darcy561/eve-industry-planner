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
    // account cannot name is not offered at all. The panel resolves them once
    // from the account's characters rather than per row.
    account: {
      characters: [
        { CharacterID: BUILDER, CharacterName: "Builder", CharacterHash: "b" },
      ],
    },
  });
});

// This file is about a job's clock and status, not about resolving places: the names arrive
// already resolved so the rows render without the query layer this mock has replaced.
const { nameHints } = vi.hoisted(() => ({ nameHints: [] }));

vi.mock(
  "../../../../../../Hooks/EveEsi/useLocationNames",
  async (importOriginal) => ({
    ...(await importOriginal()),
    default: (ids, likely) => {
      nameHints.push(likely);
      return {
        names: { 60003760: { name: "Jita IV - Moon 4" } },
        isLoading: false,
        isError: false,
        error: null,
      };
    },
  }),
);

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
  nameHints.length = 0;
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

  // A run whose installer this account cannot name is not drawn, and the
  // controls beside the list read the same rows — so "link all" takes the two
  // it can name and never the third.
  it("links only the runs it can name", () => {
    renderTab([
      esiJob(),
      esiJob({ job_id: 2 }),
      esiJob({ job_id: 3, installer_id: 90000001 }),
    ]);

    fireEvent.click(screen.getByRole("button", { name: /Link All Jobs/i }));

    expect(Object.keys(jobDraftNow().esi.industryJobs)).toEqual(["1", "2"]);
    expect(session().esiDataToLink.industryJobs.add).toEqual([1, 2]);
  });

  // The write lands on the press rather than at the end of the fade, so a
  // reader who presses a card and closes the job at once still links it.
  it("links a run when the card is pressed, without waiting for the fade", () => {
    renderTab([esiJob()]);

    fireEvent.click(screen.getByText("1 Runs"));

    expect(Object.keys(jobDraftNow().esi.industryJobs)).toEqual(["1"]);
  });

  // Two matches, one of them unnameable, and one free slot: the offer is about
  // the run that can be linked, not about the match that cannot.
  it("offers to link all when the rows it drew fit the free slots", () => {
    renderTab([
      esiJob(),
      esiJob({ job_id: 2 }),
      esiJob({ job_id: 3, installer_id: 90000001 }),
    ]);

    expect(
      screen.getByRole("button", { name: /Link All Jobs/i }),
    ).toBeEnabled();
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

// A structure refuses every character that cannot dock there, so the match says who installed it
// rather than the whole account being walked.
describe("naming a match's facility", () => {
  it("offers the character that installed the run", () => {
    renderTab([esiJob({ facility_id: 1035466617946 })]);

    expect(nameHints.at(-1)).toEqual(
      new Map([[1035466617946, new Set(["b"])]]),
    );
  });
});

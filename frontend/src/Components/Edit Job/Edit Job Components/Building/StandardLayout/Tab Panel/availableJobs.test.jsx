import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";

const { store } = vi.hoisted(() => ({
  store: {
    account: {
      actions: {
        findCharacterById: (id) => ({
          CharacterID: id,
          CharacterName: "Test Pilot",
          CharacterHash: "hash-1",
        }),
      },
    },
    applicationSettings: {
      actions: { getCurrentLocale: () => "en-GB" },
    },
  },
}));

vi.mock("../../../../../../Zustand/usersStore", async () => {
  const { usersStoreMock } =
    await import("../../../../../../tests/usersStoreHarness.js");
  return usersStoreMock(store);
});

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({}),
}));

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

const HOUR = 60 * 60 * 1000;
const START = Date.parse("2026-01-01T00:00:00.000Z");

function esiJob(overrides = {}) {
  return {
    job_id: 1,
    installer_id: 95465499,
    blueprint_id: 1000000000001,
    facility_id: 60003760,
    status: "active",
    start_date: new Date(START).toISOString(),
    end_date: new Date(START + HOUR).toISOString(),
    runs: 1,
    ...overrides,
  };
}

function renderTab(jobs) {
  return render(
    <AvailableJobsTab
      state={{
        activeJob: {
          jobID: "job-1",
          esiJobIDs: new Set(),
          totalJobSlots: 10,
        },
      }}
      actions={{}}
      jobMatches={jobs}
      isLoading={false}
      isError={false}
      error={null}
    />,
  );
}

beforeEach(() => {
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

  it("leaves a delivered job alone as the clock runs", async () => {
    renderTab([esiJob({ status: "delivered" })]);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2 * HOUR);
    });

    expect(screen.getByText("Delivered")).toBeInTheDocument();
    expect(screen.queryByText("Ready for Delivery")).not.toBeInTheDocument();
  });
});

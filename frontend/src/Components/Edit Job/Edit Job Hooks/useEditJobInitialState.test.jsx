import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const { store, navigated, related } = vi.hoisted(() => ({
  store: { current: null },
  navigated: [],
  related: { current: async () => [] },
}));

vi.mock("../../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../../tests/usersStoreHarness.js");
  return usersStoreMock(() => usersStoreState(store.current));
});
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({}),
  QueryClient: class {},
}));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => (to) => navigated.push(to),
}));
vi.mock("../../../Functions/Helper/getAllRelatedJobs", () => ({
  loadAllRelatedJobs: (...args) => related.current(...args),
}));
vi.mock("../../../Functions/Shared/getMissingESIData", () => ({
  default: async () => ({ requestedSystemIndexes: [] }),
}));
vi.mock("../../../Hooks/React Query/Backend/statisticsTotals", () => ({
  prefetchAccountTotalsQuery: async () => {},
}));

const { useEditJobInitialState } = await import("./useEditJobInitialState.js");
const { default: useUsersStore } = await import("../../../Zustand/usersStore");

const storedJob = (overrides = {}) => ({
  jobID: "job-1",
  name: "Rifter",
  itemID: 587,
  jobType: 1,
  jobStatus: 0,
  build: { setup: { "setup-1": { id: "setup-1" } }, materials: [] },
  layout: {},
  ...overrides,
});

function open(job) {
  const setActiveJobID = vi.fn();
  store.current = {
    jobData: {
      actions: { findJobInJobArray: () => job },
    },
    worldData: { actions: { addSystemIndex: () => {} } },
    applicationSettings: {
      actions: { getCustomStructureWithID: () => null },
    },
  };
  const { editSession } = useUsersStore.getState();
  editSession.actions.closeSession();

  renderHook(() =>
    useEditJobInitialState({
      jobID: "job-1",
      currentActiveJobID: undefined,
      actions: editSession.actions,
      setActiveJobID,
    }),
  );
  return { setActiveJobID };
}

beforeEach(() => {
  navigated.length = 0;
  related.current = async () => [];
});

// Opening is one half of a session's life: what the editor holds from here is
// whatever this put in it, and every change the reader makes is recorded
// against that.
describe("opening a job", () => {
  it("gives the session the job as plain data", async () => {
    open(storedJob());

    await waitFor(() =>
      expect(
        useUsersStore.getState().editSession.draft.base["job-1"],
      ).toBeDefined(),
    );

    const { editSession } = useUsersStore.getState();
    const held = editSession.draft.base["job-1"];
    expect(held.jobID).toBe("job-1");
    expect(held.name).toBe("Rifter");
    expect(Object.getPrototypeOf(held)).toBe(Object.prototype);
    expect(editSession.activeJobID).toBe("job-1");
    expect(editSession.isLoading).toBe(false);
  });

  it("opens a setup where the job names none", async () => {
    open(storedJob());

    await waitFor(() =>
      expect(
        useUsersStore.getState().editSession.draft.base["job-1"]?.layout
          ?.setupToEdit,
      ).toBe("setup-1"),
    );
  });

  it("tells the planner which job is being edited", async () => {
    const { setActiveJobID } = open(storedJob());

    await waitFor(() => expect(setActiveJobID).toHaveBeenCalledWith("job-1"));
  });

  // A job that cannot be assembled is not something to sit on a broken page
  // for: the reader goes back to the planner.
  it("returns to the planner when the job cannot be loaded", async () => {
    related.current = async () => {
      throw new Error("no");
    };
    open(storedJob());

    await waitFor(() =>
      expect(navigated).toContainEqual({ to: "/jobplanner" }),
    );
    expect(
      useUsersStore.getState().editSession.draft.base["job-1"],
    ).toBeUndefined();
  });
});

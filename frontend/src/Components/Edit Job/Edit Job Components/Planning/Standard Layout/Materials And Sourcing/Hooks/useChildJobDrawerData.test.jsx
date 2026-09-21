import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const findMaterialJobInGroup = vi.fn(() => null);

vi.mock(
  "../../../../../../../Functions/Groups/findMaterialJobInGroup.js",
  () => ({
    findMaterialJobInGroup: (...args) => findMaterialJobInGroup(...args),
  }),
);

vi.mock("../../../../../../../Zustand/usersStore", async () => {
  const { usersStoreOverSession } =
    await import("../../../../../../../tests/usersStoreHarness.js");
  return usersStoreOverSession();
});

const { useChildJobDrawerData } = await import("./useChildJobDrawerData");
const { default: useUsersStore } =
  await import("../../../../../../../Zustand/usersStore");

const session = () => useUsersStore.getState().editSession;

const material = { typeID: 34, quantity: 100 };

// Held still on purpose. The effect that costs a row lists its inputs as
// dependencies, so a fresh [] on every render would re-run it on every render —
// the panel hands it the same arrays each time, and a test that did not would be
// measuring its own fixture.
const NONE = [];

/** The job the drawer reads, opened in the session it reads it from. */
const jobState = ({ costed } = {}) => {
  session().actions.openJob("job-1", {
    jobID: "job-1",
    groupID: "",
    build: { childJobs: { 34: [] } },
  });
  if (costed) session().actions.recordSpeculativeChildJobs([costed]);
};

const open = (_state, buildSingleChildJobPreview) =>
  renderHook(() =>
    useChildJobDrawerData({
      isOpen: true,
      material,
      matchedChildJobs: NONE,
      childJobsLocation: NONE,
      buildSingleChildJobPreview,
    }),
  );

beforeEach(() => {
  vi.clearAllMocks();
  findMaterialJobInGroup.mockReturnValue(null);
  session().actions.closeSession();
});

describe("what an opened row is costed from", () => {
  it("costs the row when nothing has priced it yet", async () => {
    const build = vi.fn(async () => ({ itemID: 34, jobID: "fresh" }));

    jobState();
    const { result } = open(null, build);

    await waitFor(() => expect(result.current.jobImportState).toBe(true));
    expect(build).toHaveBeenCalled();
    expect(result.current.childJobObjects).toEqual([
      { itemID: 34, jobID: "fresh" },
    ]);
  });

  // The summary strip costs every buildable row in one go. Opening one of them
  // afterwards must show that job rather than building a second one: the row
  // above the drawer confirms against the costed job, and two jobs for one
  // material would let the drawer quote a figure the row would never use.
  it("reuses the job the row was already costed with", async () => {
    const costed = { itemID: 34, jobID: "spec-34" };
    const build = vi.fn();

    jobState({ costed });
    const { result } = open(null, build);

    await waitFor(() => expect(result.current.jobImportState).toBe(true));
    expect(build).not.toHaveBeenCalled();
    expect(result.current.childJobObjects).toEqual([costed]);
  });

  // Costing records the job, and this effect reads that record: rebuilding a
  // row it had just costed would cost it again on the next pass, and again on
  // the one after that.
  it("costs a row once however many times the effect runs", async () => {
    const build = vi.fn(async () => ({ itemID: 34, jobID: "fresh" }));
    jobState();

    const { result, rerender } = open(null, build);
    await waitFor(() => expect(result.current.jobImportState).toBe(true));

    // What recording the job does to this hook's inputs.
    session().actions.recordSpeculativeChildJobs([
      { itemID: 34, jobID: "fresh" },
    ]);
    rerender();
    rerender();

    await waitFor(() => expect(build).toHaveBeenCalledTimes(1));
  });

  // A job the group already runs is what confirming would link to, so it
  // answers the question without a speculative one being built at all.
  it("prefers the group's own job over costing a new one", async () => {
    const groupJob = { itemID: 34, jobID: "group-34" };
    findMaterialJobInGroup.mockReturnValue(groupJob);
    const build = vi.fn();

    jobState();
    const { result } = open(null, build);

    await waitFor(() => expect(result.current.jobImportState).toBe(true));
    expect(build).not.toHaveBeenCalled();
    expect(result.current.childJobObjects).toEqual([groupJob]);
  });

  // A row that could not be costed has to stay on the fetch state: a drawer
  // drawn with nothing in it reads as a material that costs nothing to build.
  it("says so when the row could not be costed", async () => {
    jobState();
    const { result } = open(
      null,
      vi.fn(async () => null),
    );

    await waitFor(() => expect(result.current.fetchError).toBe(true));
  });

  it("costs nothing for a row that is not open", async () => {
    const build = vi.fn();

    jobState();
    renderHook(() =>
      useChildJobDrawerData({
        isOpen: false,
        material,
        matchedChildJobs: NONE,
        childJobsLocation: NONE,
        buildSingleChildJobPreview: build,
      }),
    );

    await waitFor(() => expect(build).not.toHaveBeenCalled());
  });
});

// The effect re-runs whenever anything above the drawer renders, because the
// callback it costs rows with is rebuilt on every render of the page. What it
// finds must not be written back as a new array each time.
describe("what an open drawer does on a render that changed nothing", () => {
  it("holds the same jobs rather than replacing them with equal ones", async () => {
    const costed = { itemID: 34, jobID: "spec-34" };
    jobState({ costed });
    const { result, rerender } = open(null, vi.fn());

    await waitFor(() => expect(result.current.jobImportState).toBe(true));
    const first = result.current.childJobObjects;
    expect(first).toEqual([costed]);

    rerender();
    rerender();

    await waitFor(() => expect(result.current.childJobObjects).toBe(first));
  });
});

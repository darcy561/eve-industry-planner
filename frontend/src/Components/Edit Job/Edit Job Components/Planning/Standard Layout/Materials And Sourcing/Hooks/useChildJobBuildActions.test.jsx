import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { testQueryClient } from "../../../../../../../tests/queryClients.js";

const buildChildJobs = vi.fn();
const hydrateChildJobsWithMissingData = vi.fn();

vi.mock("../Helpers/childJobBuildPipeline", () => ({
  buildChildJobs: (...args) => buildChildJobs(...args),
  hydrateChildJobsWithMissingData: (...args) =>
    hydrateChildJobsWithMissingData(...args),
  asJobArray: (jobs) => (Array.isArray(jobs) ? jobs : [jobs]),
}));

const findMaterialJobInGroup = vi.fn(() => null);

vi.mock(
  "../../../../../../../Functions/Groups/findMaterialJobInGroup.js",
  () => ({
    findMaterialJobInGroup: (...args) => findMaterialJobInGroup(...args),
  }),
);

const { useChildJobBuildActions } = await import("./useChildJobBuildActions");

const MANUFACTURING = 1;
const BASE_MATERIAL = 0;

const jobState = (overrides = {}) => ({
  activeJob: {
    jobID: "parent",
    groupID: "",
    includedInGroup: false,
    selectedSetup: { systemID: 30000142 },
    build: {
      materials: [
        { typeID: 34, jobType: MANUFACTURING, quantity: 100 },
        { typeID: 35, jobType: MANUFACTURING, quantity: 200 },
        { typeID: 36, jobType: BASE_MATERIAL, quantity: 300 },
      ],
      childJobs: { 34: [], 35: [], 36: [] },
    },
  },
  temporaryChildJobs: {},
  speculativeChildJobs: {},
  ...overrides,
});

const wrapper = ({ children }) => (
  <QueryClientProvider client={testQueryClient()}>
    {children}
  </QueryClientProvider>
);

const setup = (state) => {
  const actions = {
    recordSpeculativeChildJobs: vi.fn(),
    forgetSpeculativeChildJobs: vi.fn(),
  };
  const { result } = renderHook(
    () => useChildJobBuildActions({ state, actions }),
    { wrapper },
  );
  return { result, actions };
};

beforeEach(() => {
  vi.clearAllMocks();
  findMaterialJobInGroup.mockReturnValue(null);
  // The pipeline takes one request or many — costing a single row passes the
  // request on its own — and answers in the same shape either way.
  buildChildJobs.mockImplementation(async (requests) =>
    (Array.isArray(requests) ? requests : [requests]).map((r) => ({
      jobID: `spec-${r.itemID}`,
      itemID: r.itemID,
    })),
  );
});

describe("buildSpeculativeChildJobs", () => {
  it("costs every buildable row and keeps them out of the committed map", async () => {
    const { result, actions } = setup(jobState());

    await act(() => result.current.buildSpeculativeChildJobs());

    expect(buildChildJobs.mock.calls[0][0].map((r) => r.itemID)).toEqual([
      34, 35,
    ]);
    expect(actions.recordSpeculativeChildJobs).toHaveBeenCalledWith([
      { jobID: "spec-34", itemID: 34 },
      { jobID: "spec-35", itemID: 35 },
    ]);
  });

  // A material with no blueprint cannot be built, so there is nothing to cost.
  it("skips a material that is not buildable", async () => {
    const { result } = setup(jobState());

    await act(() => result.current.buildSpeculativeChildJobs());

    expect(buildChildJobs.mock.calls[0][0].map((r) => r.itemID)).not.toContain(
      36,
    );
  });

  // A row with a real child job already has a real build cost; a guess beside it
  // would be a second, different figure for the same thing.
  it("skips a row that already has a child job linked", async () => {
    const state = jobState();
    state.activeJob.build.childJobs[34] = ["existing"];

    const { result } = setup(state);
    await act(() => result.current.buildSpeculativeChildJobs());

    expect(buildChildJobs.mock.calls[0][0].map((r) => r.itemID)).toEqual([35]);
  });

  it("skips a row already marked for creation", async () => {
    const { result } = setup(
      jobState({ temporaryChildJobs: { 34: { jobID: "temp-34" } } }),
    );

    await act(() => result.current.buildSpeculativeChildJobs());

    expect(buildChildJobs.mock.calls[0][0].map((r) => r.itemID)).toEqual([35]);
  });

  // Costing twice would throw away the first result and pay for it again. What
  // happens to the row costed earlier is the reducer's business, tested there.
  it("costs only the rows that have no price yet", async () => {
    const existing = { jobID: "spec-34", itemID: 34 };
    const { result, actions } = setup(
      jobState({ speculativeChildJobs: { 34: existing } }),
    );

    await act(() => result.current.buildSpeculativeChildJobs());

    expect(buildChildJobs.mock.calls[0][0].map((r) => r.itemID)).toEqual([35]);
    expect(actions.recordSpeculativeChildJobs).toHaveBeenCalledWith([
      { jobID: "spec-35", itemID: 35 },
    ]);
  });

  it("asks for nothing when every row is already accounted for", async () => {
    const { result, actions } = setup(
      jobState({
        speculativeChildJobs: { 34: { jobID: "a" }, 35: { jobID: "b" } },
      }),
    );

    const costed = await act(() => result.current.buildSpeculativeChildJobs());

    expect(buildChildJobs).not.toHaveBeenCalled();
    expect(actions.recordSpeculativeChildJobs).not.toHaveBeenCalled();
    expect(costed).toBe(0);
  });

  it("hydrates what it built before anything reads a price off it", async () => {
    const { result } = setup(jobState());

    await act(() => result.current.buildSpeculativeChildJobs());

    expect(hydrateChildJobsWithMissingData).toHaveBeenCalled();
  });
});

// Confirming a row in a group links the job the group already has. Pricing a
// fresh build instead would quote a figure the plan would never use.
describe("costing inside a group", () => {
  const inGroup = (overrides = {}) => {
    const state = jobState(overrides);
    state.activeJob.groupID = "group-1";
    state.activeJob.includedInGroup = true;
    return state;
  };

  it("prices from the group's own job rather than building another", async () => {
    const groupJob = { jobID: "group-job-34", itemID: 34 };
    findMaterialJobInGroup.mockImplementation((typeID) =>
      typeID === 34 ? groupJob : null,
    );

    const { result, actions } = setup(inGroup());
    await act(() => result.current.buildSpeculativeChildJobs());

    expect(buildChildJobs.mock.calls[0][0].map((r) => r.itemID)).toEqual([35]);
    expect(actions.recordSpeculativeChildJobs).toHaveBeenCalledWith([
      groupJob,
      { jobID: "spec-35", itemID: 35 },
    ]);
  });

  it("builds nothing at all when the group covers every row", async () => {
    findMaterialJobInGroup.mockImplementation((typeID) => ({
      jobID: `group-job-${typeID}`,
      itemID: typeID,
    }));

    const { result, actions } = setup(inGroup());
    const costed = await act(() => result.current.buildSpeculativeChildJobs());

    expect(buildChildJobs).not.toHaveBeenCalled();
    expect(hydrateChildJobsWithMissingData).not.toHaveBeenCalled();
    expect(actions.recordSpeculativeChildJobs).toHaveBeenCalled();
    expect(costed).toBe(2);
  });

  // A job outside a group has no group to consult, and asking would search one
  // the job does not belong to.
  it("does not consult the group for a job that is not in one", async () => {
    const { result } = setup(jobState());
    await act(() => result.current.buildSpeculativeChildJobs());

    expect(findMaterialJobInGroup).not.toHaveBeenCalled();
  });
});

// Opening a row costs it. That price used to live in the drawer's own state, so
// the row above it could not act on the job behind the figure it was showing —
// which is what made confirming a material mean expanding its row first.
describe("buildSingleChildJobPreview", () => {
  const material = { typeID: 34, quantity: 100 };

  it("records the job it costs where the row can reach it", async () => {
    const { result, actions } = setup(jobState());

    await act(() => result.current.buildSingleChildJobPreview({ material }));

    expect(actions.recordSpeculativeChildJobs).toHaveBeenCalledWith({
      jobID: "spec-34",
      itemID: 34,
    });
  });

  // A price is read off the job, so it is hydrated before anything is recorded
  // for a row to act on.
  it("hydrates the job before recording it", async () => {
    const order = [];
    hydrateChildJobsWithMissingData.mockImplementation(async () =>
      order.push("hydrate"),
    );
    const { result, actions } = setup(jobState());
    actions.recordSpeculativeChildJobs.mockImplementation(() =>
      order.push("record"),
    );

    await act(() => result.current.buildSingleChildJobPreview({ material }));

    expect(order).toEqual(["hydrate", "record"]);
  });

  it("records nothing when the job could not be built", async () => {
    buildChildJobs.mockResolvedValueOnce([]);
    const { result, actions } = setup(jobState());

    const job = await act(() =>
      result.current.buildSingleChildJobPreview({ material }),
    );

    expect(job).toBeNull();
    expect(actions.recordSpeculativeChildJobs).not.toHaveBeenCalled();
  });
});

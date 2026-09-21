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

vi.mock("../../../../../../../Zustand/usersStore", async () => {
  const { usersStoreOverSession } =
    await import("../../../../../../../tests/usersStoreHarness.js");
  return usersStoreOverSession();
});

const { useChildJobBuildActions } = await import("./useChildJobBuildActions");
const { default: useUsersStore } =
  await import("../../../../../../../Zustand/usersStore");

const session = () => useUsersStore.getState().editSession;

const MANUFACTURING = 1;
const BASE_MATERIAL = 0;

/**
 * Two buildable materials and one that is not, as the planner stores the job.
 *
 * What each material takes is stated by the setup: a material row carries no
 * quantity of its own.
 */
const jobDocument = ({ build = {}, ...rest } = {}) => ({
  jobID: "parent",
  itemID: 587,
  itemsProducedPerRun: 1,
  groupID: "",
  parentJobs: [],
  layout: { setupToEdit: "setup0" },
  build: {
    materials: {
      [String(34)]: { typeID: 34, jobType: MANUFACTURING },
      [String(35)]: { typeID: 35, jobType: MANUFACTURING },
      [String(36)]: { typeID: 36, jobType: BASE_MATERIAL },
    },
    childJobs: { 34: [], 35: [], 36: [] },
    extrasCosts: {},
    inventionEntries: {},
    setup: {
      setup0: {
        id: "setup0",
        systemID: 30000142,
        runCount: 1,
        jobCount: 1,
        materialCount: {
          34: { typeID: 34, quantity: 100 },
          35: { typeID: 35, quantity: 200 },
          36: { typeID: 36, quantity: 300 },
        },
      },
    },
    ...build,
  },
  esi: { industryJobs: {}, marketOrders: {}, transactions: {} },
  ...rest,
});

const wrapper = ({ children }) => (
  <QueryClientProvider client={testQueryClient()}>
    {children}
  </QueryClientProvider>
);

const setup = (document = jobDocument(), { costed, temporary } = {}) => {
  session().actions.openJob(document.jobID, document);
  if (costed) session().actions.recordSpeculativeChildJobs(costed);
  if (temporary) session().actions.setTemporaryChildJobs(temporary);
  const { result } = renderHook(() => useChildJobBuildActions(), { wrapper });
  return { result };
};

/** The jobs costed for a row without being committed to. */
const costedJobs = () => session().speculativeChildJobs;

beforeEach(() => {
  vi.clearAllMocks();
  session().actions.closeSession();
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
    const { result } = setup();

    await act(() => result.current.buildSpeculativeChildJobs());

    expect(buildChildJobs.mock.calls[0][0].map((r) => r.itemID)).toEqual([
      34, 35,
    ]);
    expect(costedJobs()).toEqual({
      34: { jobID: "spec-34", itemID: 34 },
      35: { jobID: "spec-35", itemID: 35 },
    });
    expect(session().parentChildToEdit.childJobs).toEqual({});
  });

  // A material with no blueprint cannot be built, so there is nothing to cost.
  it("skips a material that is not buildable", async () => {
    const { result } = setup();

    await act(() => result.current.buildSpeculativeChildJobs());

    expect(buildChildJobs.mock.calls[0][0].map((r) => r.itemID)).not.toContain(
      36,
    );
  });

  // A row with a real child job already has a real build cost; a guess beside it
  // would be a second, different figure for the same thing.
  it("skips a row that already has a child job linked", async () => {
    const { result } = setup(
      jobDocument({
        build: { childJobs: { 34: ["existing"], 35: [], 36: [] } },
      }),
    );
    await act(() => result.current.buildSpeculativeChildJobs());

    expect(buildChildJobs.mock.calls[0][0].map((r) => r.itemID)).toEqual([35]);
  });

  it("skips a row already marked for creation", async () => {
    const { result } = setup(undefined, {
      temporary: { 34: { jobID: "temp-34", itemID: 34 } },
    });

    await act(() => result.current.buildSpeculativeChildJobs());

    expect(buildChildJobs.mock.calls[0][0].map((r) => r.itemID)).toEqual([35]);
  });

  // Costing twice would throw away the first result and pay for it again. What
  // happens to the row costed earlier belongs to the session, and is tested
  // where that lives.
  it("costs only the rows that have no price yet", async () => {
    const existing = { jobID: "spec-34", itemID: 34 };
    const { result } = setup(undefined, { costed: existing });

    await act(() => result.current.buildSpeculativeChildJobs());

    expect(buildChildJobs.mock.calls[0][0].map((r) => r.itemID)).toEqual([35]);
    expect(costedJobs()[34]).toBe(existing);
    expect(costedJobs()[35]).toEqual({ jobID: "spec-35", itemID: 35 });
  });

  it("asks for nothing when every row is already accounted for", async () => {
    const { result } = setup(undefined, {
      costed: [
        { jobID: "a", itemID: 34 },
        { jobID: "b", itemID: 35 },
      ],
    });

    const costed = await act(() => result.current.buildSpeculativeChildJobs());

    expect(buildChildJobs).not.toHaveBeenCalled();
    expect(costed).toBe(0);
  });

  it("hydrates what it built before anything reads a price off it", async () => {
    const { result } = setup();

    await act(() => result.current.buildSpeculativeChildJobs());

    expect(hydrateChildJobsWithMissingData).toHaveBeenCalled();
  });
});

// Confirming a row in a group links the job the group already has. Pricing a
// fresh build instead would quote a figure the plan would never use.
describe("costing inside a group", () => {
  const inGroup = () =>
    jobDocument({ groupID: "group-1", includedInGroup: true });

  it("prices from the group's own job rather than building another", async () => {
    const groupJob = { jobID: "group-job-34", itemID: 34 };
    findMaterialJobInGroup.mockImplementation((typeID) =>
      typeID === 34 ? groupJob : null,
    );

    const { result } = setup(inGroup());
    await act(() => result.current.buildSpeculativeChildJobs());

    expect(buildChildJobs.mock.calls[0][0].map((r) => r.itemID)).toEqual([35]);
    expect(costedJobs()).toEqual({
      34: groupJob,
      35: { jobID: "spec-35", itemID: 35 },
    });
  });

  it("builds nothing at all when the group covers every row", async () => {
    findMaterialJobInGroup.mockImplementation((typeID) => ({
      jobID: `group-job-${typeID}`,
      itemID: typeID,
    }));

    const { result } = setup(inGroup());
    const costed = await act(() => result.current.buildSpeculativeChildJobs());

    expect(buildChildJobs).not.toHaveBeenCalled();
    expect(hydrateChildJobsWithMissingData).not.toHaveBeenCalled();
    expect(Object.keys(costedJobs())).toEqual(["34", "35"]);
    expect(costed).toBe(2);
  });

  // A job outside a group has no group to consult, and asking would search one
  // the job does not belong to.
  it("does not consult the group for a job that is not in one", async () => {
    const { result } = setup();
    await act(() => result.current.buildSpeculativeChildJobs());

    expect(findMaterialJobInGroup).not.toHaveBeenCalled();
  });
});

// Opening a row costs it. That price used to live in the drawer's own state, so
// the row above it could not act on the job behind the figure it was showing —
// which is what made confirming a material mean expanding its row first.
describe("buildSingleChildJobPreview", () => {
  const material = { typeID: 34 };

  it("records the job it costs where the row can reach it", async () => {
    const { result } = setup();

    await act(() => result.current.buildSingleChildJobPreview({ material }));

    expect(costedJobs()[34]).toEqual({ jobID: "spec-34", itemID: 34 });
  });

  // The row is costed for what the job takes of it, which the setup states.
  it("builds the job at the quantity the setup asks for", async () => {
    const { result } = setup();

    await act(() => result.current.buildSingleChildJobPreview({ material }));

    expect(buildChildJobs.mock.calls[0][0]).toMatchObject({
      itemID: 34,
      itemQty: 100,
    });
  });

  // A price is read off the job, so it is hydrated before anything is recorded
  // for a row to act on.
  it("hydrates the job before recording it", async () => {
    let costedWhenHydrated;
    hydrateChildJobsWithMissingData.mockImplementation(async () => {
      costedWhenHydrated = costedJobs();
    });
    const { result } = setup();

    await act(() => result.current.buildSingleChildJobPreview({ material }));

    expect(costedWhenHydrated).toEqual({});
    expect(costedJobs()[34]).toBeDefined();
  });

  it("records nothing when the job could not be built", async () => {
    buildChildJobs.mockResolvedValueOnce([]);
    const { result } = setup();

    const job = await act(() =>
      result.current.buildSingleChildJobPreview({ material }),
    );

    expect(job).toBeNull();
    expect(costedJobs()).toEqual({});
  });
});

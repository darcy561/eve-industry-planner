import { jobMaking } from "../../../../../../../tests/editJobFixtures";
import { beforeEach, describe, expect, it, vi } from "vitest";

const recalculateJobForNewTotal = vi.fn();
const hydrateChildJobsWithMissingData = vi.fn().mockResolvedValue(undefined);

vi.mock(
  "../../../../../../../Functions/Job/setups/recalculateJobForNewTotal",
  () => ({
    default: (...args) => recalculateJobForNewTotal(...args),
  }),
);

vi.mock("./childJobBuildPipeline", () => ({
  asJobArray: (jobs) => (Array.isArray(jobs) ? jobs : [jobs]),
  hydrateChildJobsWithMissingData: (...args) =>
    hydrateChildJobsWithMissingData(...args),
}));

const { finaliseCreatedChildJobs } = await import("./finaliseCreatedChildJobs");

const queryClient = {};
const actions = { markChildJobsForAddition: vi.fn() };

const job = (produced) => jobMaking(produced, { jobID: "child-1" });

const commit = (overrides = {}) =>
  finaliseCreatedChildJobs({
    jobsForMissingDataAndRecalc: [],
    jobsToMarkForAddition: job(40),
    actions,
    requiredQuantity: 100,
    queryClient,
    ...overrides,
  });

beforeEach(() => vi.clearAllMocks());

// The panel costs an uncommitted job against the whole requirement, on the
// grounds that committing sizes it to match. That has to actually happen, or the
// figure the player accepted was never true.
describe("committing a child job", () => {
  it("sizes it to what the parent needs", async () => {
    await commit();

    expect(recalculateJobForNewTotal).toHaveBeenCalledWith(
      expect.objectContaining({ jobID: "child-1" }),
      100,
      queryClient,
    );
    expect(actions.markChildJobsForAddition).toHaveBeenCalled();
  });

  it("leaves a job that already makes the right amount alone", async () => {
    await commit({ jobsToMarkForAddition: job(100) });

    expect(recalculateJobForNewTotal).not.toHaveBeenCalled();
    expect(actions.markChildJobsForAddition).toHaveBeenCalled();
  });

  // Several jobs producing the item divide the requirement between them, so
  // resizing each to the whole of it would multiply the output.
  it("resizes nothing when more than one job produces the item", async () => {
    await commit({ jobsToMarkForAddition: [job(40), job(40)] });

    expect(recalculateJobForNewTotal).not.toHaveBeenCalled();
    expect(actions.markChildJobsForAddition).toHaveBeenCalled();
  });

  it("still commits when the caller names no requirement", async () => {
    await commit({ requiredQuantity: undefined });

    expect(recalculateJobForNewTotal).not.toHaveBeenCalled();
    expect(actions.markChildJobsForAddition).toHaveBeenCalled();
  });
});

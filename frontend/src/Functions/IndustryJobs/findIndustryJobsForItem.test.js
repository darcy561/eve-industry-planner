import { describe, expect, it, vi } from "vitest";

vi.mock("../../Zustand/usersStore", async () => {
  const { usersStoreMock } = await import("../../tests/usersStoreHarness.js");
  return usersStoreMock();
});

const { default: findIndustryJobsForItem } =
  await import("./findIndustryJobsForItem.js");
const { jobFromDocument } = await import("../JobDocuments/jobDocument.js");

function run(job_id, overrides = {}) {
  return {
    job_id,
    product_type_id: 587,
    runs: 10,
    cost: 1250000,
    status: "active",
    facility_id: 1035466617946,
    ...overrides,
  };
}

function job() {
  return jobFromDocument({
    jobID: "job-1",
    itemID: 587,
    jobType: 1,
    name: "Oxygen Fuel Block",
  });
}

const ids = (runs) => runs.map((r) => r.job_id);

const linkable = (job) => ({
  itemID: job.itemID,
  industryJobs: job.esi.industryJobs,
});

const holding = (...runs) => ({
  itemID: 587,
  industryJobs: Object.fromEntries(
    runs.map((linked) => [String(linked.job_id), linked]),
  ),
});

describe("the industry runs a job can link", () => {
  it("offers runs that made this job's item", () => {
    expect(
      ids(
        findIndustryJobsForItem(
          [run(1), run(2, { product_type_id: 34 })],
          job(),
        ),
      ),
    ).toEqual([1]);
  });

  it("offers a run once however many times ESI reported it", () => {
    const reported = [run(1), { ...run(1) }, { ...run(1), installer_id: 99 }];

    expect(ids(findIndustryJobsForItem(reported, linkable(job())))).toEqual([
      1,
    ]);
  });

  it("does not offer a run this job already holds", () => {
    expect(
      ids(findIndustryJobsForItem([run(1), run(2)], holding(run(1)))),
    ).toEqual([2]);
  });

  it("does not offer a run another job on the account holds", () => {
    const offered = findIndustryJobsForItem([run(1), run(2)], linkable(job()), {
      linkedAcrossAccount: new Set([1]),
    });

    expect(ids(offered)).toEqual([2]);
  });

  it("offers a run that is being unlinked elsewhere", () => {
    const offered = findIndustryJobsForItem([run(1), run(2)], linkable(job()), {
      linkedAcrossAccount: new Set([1]),
      beingRemoved: [1],
    });

    expect(ids(offered)).toEqual([1, 2]);
  });

  it("keeps a run this job holds out of the list", () => {
    const offered = findIndustryJobsForItem([run(1)], holding(run(1)), {
      beingRemoved: [1],
    });

    expect(offered).toEqual([]);
  });

  it("copes with nothing reported and with a missing job", () => {
    expect(findIndustryJobsForItem([], linkable(job()))).toEqual([]);
    expect(findIndustryJobsForItem(undefined, linkable(job()))).toEqual([]);
    expect(findIndustryJobsForItem([run(1)], null)).toEqual([]);
  });
});

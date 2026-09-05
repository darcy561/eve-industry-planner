import { describe, expect, it, vi } from "vitest";

vi.mock("../../Zustand/usersStore", () => ({
  default: {
    getState: () => ({
      account: { accountID: "acc-1", isLoggedIn: false },
      jobData: { jobArray: [], actions: {} },
      applicationSettings: { actions: { getCurrentLocale: () => "en-GB" } },
    }),
  },
}));

const { default: findIndustryJobsForItem } = await import(
  "./findIndustryJobsForItem.js"
);
const { default: Job } = await import("../../Classes/job.js");

const OWNER = { CharacterHash: "hash-1", CharacterID: 2117000001 };

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
  return new Job({
    jobID: "job-1",
    itemID: 587,
    jobType: 1,
    name: "Oxygen Fuel Block",
  });
}

const ids = (runs) => runs.map((r) => r.job_id);

describe("the industry runs a job can link", () => {
  it("offers runs that made this job's item", () => {
    expect(
      ids(findIndustryJobsForItem([run(1), run(2, { product_type_id: 34 })], job())),
    ).toEqual([1]);
  });

  // ESI reports a corporation run once per character holding the role, so the
  // same run arrives several times in one list.
  it("offers a run once however many times ESI reported it", () => {
    const reported = [run(1), { ...run(1) }, { ...run(1), installer_id: 99 }];

    expect(ids(findIndustryJobsForItem(reported, job()))).toEqual([1]);
  });

  it("does not offer a run this job already holds", () => {
    const activeJob = job();
    activeJob.linkESIJob(run(1), OWNER);

    expect(ids(findIndustryJobsForItem([run(1), run(2)], activeJob))).toEqual([2]);
  });

  it("does not offer a run another job on the account holds", () => {
    const offered = findIndustryJobsForItem([run(1), run(2)], job(), {
      linkedAcrossAccount: new Set([1]),
    });

    expect(ids(offered)).toEqual([2]);
  });

  // Unlinking is pending until the job saves, so a run on its way out is
  // available again straight away.
  it("offers a run that is being unlinked elsewhere", () => {
    const offered = findIndustryJobsForItem([run(1), run(2)], job(), {
      linkedAcrossAccount: new Set([1]),
      beingRemoved: [1],
    });

    expect(ids(offered)).toEqual([1, 2]);
  });

  // A run this job holds stays hidden even while it is queued for removal:
  // it is already on the job, and the panel lists it as linked.
  it("keeps a run this job holds out of the list", () => {
    const activeJob = job();
    activeJob.linkESIJob(run(1), OWNER);

    const offered = findIndustryJobsForItem([run(1)], activeJob, {
      beingRemoved: [1],
    });

    expect(offered).toEqual([]);
  });

  it("copes with nothing reported and with a missing job", () => {
    expect(findIndustryJobsForItem([], job())).toEqual([]);
    expect(findIndustryJobsForItem(undefined, job())).toEqual([]);
    expect(findIndustryJobsForItem([run(1)], null)).toEqual([]);
  });
});

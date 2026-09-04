import { describe, expect, it, vi } from "vitest";

vi.mock("../src/Zustand/usersStore", () => ({
  default: {
    getState: () => ({
      account: { accountID: "acc-1", isLoggedIn: false },
      jobData: { jobArray: [], actions: {} },
      applicationSettings: { actions: { getCurrentLocale: () => "en-GB" } },
    }),
  },
}));

const { default: Job } = await import("../src/Classes/job.js");
const { default: LinkedESIJob } = await import("../src/Classes/linkedESIJob.js");
const { default: findIndustryJobsForItem } = await import(
  "../src/Functions/IndustryJobs/findIndustryJobsForItem.js"
);

// The shipped rule the Building panel offers runs by.
function offeredRuns(allIndustryJobs, activeJob, linkedAcrossAccount = new Set()) {
  return findIndustryJobsForItem(allIndustryJobs, activeJob, {
    linkedAcrossAccount,
  });
}

const OWNER = { CharacterHash: "hash-1", CharacterID: 2117000001 };
const OTHER_OWNER = { CharacterHash: "hash-2", CharacterID: 2117000002 };

// An industry job as ESI reports it. ESI calls the structure `facility_id`; the
// row stores it as `station_id`.
function esiRun(job_id, overrides = {}) {
  return {
    job_id,
    installer_id: OWNER.CharacterID,
    facility_id: 1035466617946,
    activity_id: 1,
    blueprint_id: 1000000001,
    blueprint_type_id: 785,
    product_type_id: 587,
    runs: 10,
    cost: 1250000,
    status: "active",
    start_date: "2026-08-01T00:00:00Z",
    end_date: "2026-08-02T00:00:00Z",
    ...overrides,
  };
}

function newJob() {
  return new Job({
    jobID: "job-1",
    itemID: 587,
    jobType: 1,
    name: "Oxygen Fuel Block",
  });
}

describe("linking industry runs to a job", () => {
  it("keeps every figure in step from an ESI run to a stored document", () => {
    const job = newJob();

    // 1. Nothing linked: the job has no install cost and holds no runs.
    expect(job.totalInstallCost).toBe(0);
    expect(job.esiJobIDs.size).toBe(0);

    // 2. ESI reports two runs of this item, and one of something else.
    const reported = [
      esiRun(500000001),
      esiRun(500000002, { cost: 750000, runs: 5 }),
      esiRun(500000003, { product_type_id: 34 }),
    ];

    expect(offeredRuns(reported, job).map((r) => r.job_id)).toEqual([
      500000001, 500000002,
    ]);

    // 3. Linking them records what each run cost, summed at call time.
    job.linkESIJob(reported[0], OWNER);
    job.linkESIJob(reported[1], OWNER);

    expect(job.totalInstallCost).toBe(2000000);
    expect(job.esiJobIDs).toEqual(new Set([500000001, 500000002]));
    // A job with runs against it is no longer waiting to be started.
    expect(job.isReadyToStart).toBe(false);

    // 4. A linked run keeps ESI's own names and the character that installed it.
    const [first] = job.build.costs.linkedJobs;
    expect(first).toBeInstanceOf(LinkedESIJob);
    expect(first.station_id).toBe(1035466617946);
    expect(first.character_id).toBe(OWNER.CharacterID);
    expect(first.isActive).toBe(true);

    // 5. Linked runs are no longer offered.
    expect(offeredRuns(reported, job)).toEqual([]);

    // 6. ESI reports the first run delivered; the row takes it.
    job.updateLinkedJobData([
      { ...reported[0], status: "delivered", completed_date: "2026-08-02T01:00:00Z" },
      reported[1],
    ]);

    expect(job.build.costs.linkedJobs[0].isDelivered).toBe(true);
    expect(job.build.costs.linkedJobs[1].isActive).toBe(true);
    // Delivery does not change what the run cost.
    expect(job.totalInstallCost).toBe(2000000);

    // 7. The document carries the rows, and the cost is worked out again on read.
    const document = job.toDocument();
    expect(document.build.costs.linkedJobs).toHaveLength(2);
    expect(document.build.costs.linkedJobs[0].job_id).toBe(500000001);

    const reopened = new Job(document);
    expect(reopened.totalInstallCost).toBe(2000000);
    expect(reopened.esiJobIDs).toEqual(job.esiJobIDs);

    // 8. Unlinking takes the run and its cost away together.
    reopened.unlinkESIJob({ job_id: 500000001 });

    expect(reopened.totalInstallCost).toBe(750000);
    expect(reopened.esiJobIDs).toEqual(new Set([500000002]));
  });

  // The panel links on an 800ms delay, so a second click, or "link all" landing
  // while a click is still pending, asks for the same run twice.
  it("links a run once however many times it is asked for", () => {
    const job = newJob();
    const run = esiRun(500000001);

    job.linkESIJob(run, OWNER);
    job.linkESIJob(run, OWNER);
    job.linkESIJob({ ...run }, OTHER_OWNER);

    expect(job.build.costs.linkedJobs).toHaveLength(1);
    expect(job.totalInstallCost).toBe(1250000);
    expect(job.build.costs.linkedJobs[0].character_id).toBe(OWNER.CharacterID);
  });

  // A corporation run is reported by every character holding the role, so the
  // same run arrives several times in one list.
  it("offers a corporation run once however many characters report it", () => {
    const job = newJob();
    const corporationRun = esiRun(500000004, { is_corporation: true });

    const reported = [
      corporationRun,
      { ...corporationRun },
      { ...corporationRun, installer_id: OTHER_OWNER.CharacterID },
    ];

    expect(offeredRuns(reported, job)).toHaveLength(1);
  });

  it("does not offer a run another job on the account already holds", () => {
    const job = newJob();
    const reported = [esiRun(500000001), esiRun(500000002)];

    const offered = offeredRuns(reported, job, new Set([500000001]));

    expect(offered.map((r) => r.job_id)).toEqual([500000002]);
  });

  // Unlinking is pending until the job saves, so the run must not come back
  // twice if it is linked again in the same sitting.
  it("can relink a run that was unlinked", () => {
    const job = newJob();
    const run = esiRun(500000001);

    job.linkESIJob(run, OWNER);
    job.unlinkESIJob({ job_id: 500000001 });
    job.linkESIJob(run, OWNER);

    expect(job.build.costs.linkedJobs).toHaveLength(1);
    expect(job.totalInstallCost).toBe(1250000);
  });

  it("ignores a run with no owner rather than storing a nameless one", () => {
    const job = newJob();

    job.linkESIJob(esiRun(500000001), null);
    job.linkESIJob(null, OWNER);

    expect(job.build.costs.linkedJobs).toHaveLength(0);
    expect(job.totalInstallCost).toBe(0);
  });
});

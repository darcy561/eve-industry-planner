import {
  nextRunToFinish,
  totalInstallCost,
} from "../Components/Edit Job/Edit Job Hooks/jobSelectors";
import { afterEach, describe, expect, test, vi } from "vitest";
import LinkedESIJob from "./linkedESIJob.js";
import {
  jobFromDocument,
  toDocument,
} from "../Functions/JobDocuments/jobDocument";

const HOUR = 60 * 60 * 1000;

function esiJob(overrides = {}) {
  return {
    job_id: 900001,
    status: "active",
    runs: 10,
    facility_id: 60003760,
    start_date: "2026-09-01T00:00:00Z",
    end_date: "2026-09-02T00:00:00Z",
    cost: 1500,
    blueprint_type_id: 1234,
    blueprint_id: 5678,
    product_type_id: 587,
    activity_id: 1,
    duration: 86400,
    is_corporation: false,
    ...overrides,
  };
}

function runningBetween(startedHoursAgo, finishesInHours, status = "active") {
  const now = Date.now();
  return new LinkedESIJob({
    job_id: 1,
    status,
    start_date: new Date(now - startedHoursAgo * HOUR).toISOString(),
    end_date: new Date(now + finishesInHours * HOUR).toISOString(),
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe("linking a job from ESI", () => {
  test("takes what ESI returned, and the character it was fetched for", () => {
    const linked = LinkedESIJob.fromESI(esiJob(), { CharacterHash: "ABC123" });

    expect(linked.CharacterHash).toBe("ABC123");
    expect(linked.job_id).toBe(900001);
    expect(linked.cost).toBe(1500);

    expect(linked.station_id).toBe(60003760);
    expect(linked.completed_date).toBeNull();
  });

  test("records the character whose jobs were read", () => {
    const linked = LinkedESIJob.fromESI(esiJob({ character_id: undefined }), {
      CharacterHash: "ABC123",
      CharacterID: 94800326,
    });

    expect(linked.character_id).toBe(94800326);
    expect(linked.corporation_id).toBeNull();
    expect(linked.is_corporation).toBe(false);
  });

  test("keeps the character id ESI gave over the character it was read for", () => {
    const linked = LinkedESIJob.fromESI(esiJob({ character_id: 12345 }), {
      CharacterHash: "ABC123",
      CharacterID: 94800326,
    });

    expect(linked.character_id).toBe(12345);
  });

  test("only takes a corporation from a corporation's own jobs", () => {
    const personal = LinkedESIJob.fromESI(esiJob(), {
      CharacterHash: "ABC123",
      CharacterID: 94800326,
      corporation_id: 98699553,
    });
    const corporate = LinkedESIJob.fromESI(
      esiJob({ is_corporation: true, corporation_id: 98699553 }),
      { CharacterHash: "ABC123", CharacterID: 94800326 },
    );

    expect(personal.corporation_id).toBeNull();
    expect(corporate.corporation_id).toBe(98699553);
    expect(corporate.is_corporation).toBe(true);
  });

  test("a stored row survives the round trip", () => {
    const row = LinkedESIJob.fromESI(esiJob(), {
      CharacterHash: "ABC123",
    }).toDocument();

    expect(new LinkedESIJob(row).toDocument()).toEqual(row);
  });
});

describe("taking the latest from ESI", () => {
  test("an active run takes its new status and dates", () => {
    const linked = runningBetween(6, 6);

    expect(
      linked.applyLatest({
        job_id: 1,
        status: "delivered",
        completed_date: "2026-09-02T00:00:00Z",
        end_date: "2026-09-02T00:00:00Z",
      }),
    ).toBe(true);
    expect(linked.status).toBe("delivered");
    expect(linked.completed_date).toBe("2026-09-02T00:00:00Z");
  });

  test("a run the planner already knows finished is left alone", () => {
    const linked = runningBetween(24, -1, "delivered");

    expect(linked.applyLatest({ job_id: 1, status: "active" })).toBe(false);
    expect(linked.status).toBe("delivered");
  });
});

describe("a job's linked runs", () => {
  function jobWithLinkedRuns(...runs) {
    return jobFromDocument({
      jobID: "job-1",
      itemID: 587,
      jobType: 1,
      esi: {
        industryJobs: Object.fromEntries(
          runs.map((run) => {
            const linked = LinkedESIJob.fromESI(run, {
              CharacterHash: "ABC123",
            });
            return [String(linked.job_id), linked.toDocument()];
          }),
        ),
      },
    });
  }

  test("are hydrated as linked jobs and serialise back to rows", () => {
    const job = jobWithLinkedRuns(esiJob());

    const stored = job.esi.industryJobs["900001"];
    expect(Object.getPrototypeOf(stored)).toBe(Object.prototype);

    const reloaded = jobFromDocument(toDocument(job));
    expect(reloaded.esi.industryJobs["900001"]).toEqual(stored);
    expect(totalInstallCost(reloaded)).toBe(1500);
  });

  test("the one finishing first is what the planner counts down to", () => {
    const job = jobWithLinkedRuns(
      esiJob({ job_id: 1, end_date: "2026-09-05T00:00:00Z" }),
      esiJob({ job_id: 2, end_date: "2026-09-03T00:00:00Z" }),
      esiJob({ job_id: 3, end_date: "2026-09-09T00:00:00Z" }),
    );

    expect(nextRunToFinish(job).job_id).toBe(2);
  });

  test("nothing linked has nothing to wait for", () => {
    expect(nextRunToFinish(jobWithLinkedRuns())).toBeNull();
  });
});

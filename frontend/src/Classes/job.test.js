import { describe, expect, it } from "vitest";

import Job from "./job.js";

describe("the revision a job was delivered at", () => {
  it("is kept and sent back", () => {
    const job = new Job({ jobID: "job-1", _meta: { revision: 7 } });

    expect(job._meta.revision).toBe(7);
    expect(job.toDocument()._meta.revision).toBe(7);
  });

  it("is absent on a job that was never stored", () => {
    const job = new Job({ jobID: "job-1" });

    expect("revision" in job._meta).toBe(false);
    expect(job.toDocument()._meta.revision).toBeUndefined();
  });
});

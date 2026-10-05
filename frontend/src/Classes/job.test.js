import { describe, expect, it } from "vitest";

import { jobFromDocument, toDocument } from "../Functions/Job/jobDocument";

describe("the revision a job was delivered at", () => {
  it("is kept and sent back", () => {
    const job = jobFromDocument({ jobID: "job-1", _meta: { revision: 7 } });

    expect(job._meta.revision).toBe(7);
    expect(toDocument(job)._meta.revision).toBe(7);
  });

  it("is absent on a job that was never stored", () => {
    const job = jobFromDocument({ jobID: "job-1" });

    expect("revision" in job._meta).toBe(false);
    expect(toDocument(job)._meta.revision).toBeUndefined();
  });
});

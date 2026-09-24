import { describe, expect, it } from "vitest";

import { jobWriteEnvelope } from "./jobWriteEnvelope.js";

/** An entry as the draft log records one: what changed, as paths. */
const entry = (...patches) => ({ patches });
const changed = (path, op = "replace") => ({ op, path });

const document = () => ({
  jobID: "job-1",
  name: "A job",
  build: {
    materials: { 34: { typeID: 34, volume: 100 } },
    extrasCosts: { "e-1": { amount: 10 }, "e-2": { amount: 20 } },
  },
  _meta: { revision: 7 },
});

/** A job as the store holds one: the fields the envelope states, and its document. */
function job(over = {}) {
  return {
    jobID: "job-1",
    includedInGroup: false,
    groupID: "",
    _meta: { revision: 7 },
    toDocument: () => document(),
    ...over,
  };
}

describe("a write the reader's changes are known for", () => {
  it("carries the fields that changed, checked against the revision behind them", () => {
    const write = jobWriteEnvelope(job(), [entry(changed(["name"]))]);

    expect(write).toEqual({
      jobID: "job-1",
      includedInGroup: false,
      groupID: "",
      revision: 7,
      document: { name: "A job" },
    });
  });

  it("names the rows that went", () => {
    const write = jobWriteEnvelope(job(), [
      entry(changed(["build", "extrasCosts", "e-3"], "remove")),
    ]);

    expect(write.removed).toEqual([["build", "extrasCosts", "e-3"]]);
  });

  // `removed` is absent rather than empty so the common write says nothing
  // about rows at all.
  it("says nothing about rows when none went", () => {
    const write = jobWriteEnvelope(job(), [entry(changed(["name"]))]);

    expect(write).not.toHaveProperty("removed");
  });
});

describe("a write that cannot say what changed", () => {
  it("carries the whole document when nothing recorded the change", () => {
    const write = jobWriteEnvelope(job(), null);

    expect(write.document).toEqual(document());
    expect(write).not.toHaveProperty("revision");
  });

  // A job that has never been stored has no revision to check a field write
  // against, and its document does not exist to have fields written into. The
  // log behind it is real, which is what makes this worth stating: reading the
  // log alone would send a partial create.
  it("carries the whole document for a job that has never been written", () => {
    const created = job({ _meta: {}, toDocument: () => ({ jobID: "job-1" }) });

    const write = jobWriteEnvelope(created, [entry(changed(["name"]))]);

    expect(write.document).toEqual({ jobID: "job-1" });
    expect(write).not.toHaveProperty("revision");
  });
});

// The lock gate reads the group off the envelope before any document is
// decoded, and a partial document carries a field only when the reader changed
// it — so a write that narrowed to its changed fields would otherwise look like
// a job belonging to no group.
describe("what the lock gate is told", () => {
  it("states the group on a write carrying only the fields that changed", () => {
    const grouped = job({ includedInGroup: true, groupID: "group-3" });

    const write = jobWriteEnvelope(grouped, [entry(changed(["name"]))]);

    expect(write.includedInGroup).toBe(true);
    expect(write.groupID).toBe("group-3");
  });

  it("states a job's absence from a group rather than leaving it out", () => {
    const write = jobWriteEnvelope(job({ groupID: undefined }), null);

    expect(write.includedInGroup).toBe(false);
    expect(write.groupID).toBe("");
  });
});

// A revision is spent by every write, and a document that moved refuses a write
// built from where it stood. A write carrying nothing would spend one for no
// change, costing another member the write they were making at the time.
describe("a log that leaves nothing to write", () => {
  it("is no write at all", () => {
    const write = jobWriteEnvelope(job(), [
      entry(changed(["build", "materials", "99", "volume"])),
    ]);

    expect(write).toBeNull();
  });
});

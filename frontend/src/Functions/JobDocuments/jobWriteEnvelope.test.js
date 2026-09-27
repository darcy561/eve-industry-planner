import { describe, expect, it } from "vitest";

import { jobWriteEnvelope } from "./jobWriteEnvelope.js";
import { toDocument } from "./jobDocument.js";

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

function job(over = {}) {
  return {
    ...document(),
    includedInGroup: false,
    groupID: "",
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

  it("says nothing about rows when none went", () => {
    const write = jobWriteEnvelope(job(), [entry(changed(["name"]))]);

    expect(write).not.toHaveProperty("removed");
  });
});

describe("a write that cannot say what changed", () => {
  it("carries the whole document when nothing recorded the change", () => {
    const built = job();
    const write = jobWriteEnvelope(built, null);

    expect(write.document).toEqual(toDocument(built));
    expect(write).not.toHaveProperty("revision");
  });

  it("carries the whole document for a job that has never been written", () => {
    const created = job({ _meta: {} });

    const write = jobWriteEnvelope(created, [entry(changed(["name"]))]);

    expect(write.document).toEqual(toDocument(created));
    expect(write).not.toHaveProperty("revision");
  });
});

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

describe("a log that leaves nothing to write", () => {
  it("is no write at all", () => {
    const write = jobWriteEnvelope(job(), [
      entry(changed(["build", "materials", "99", "volume"])),
    ]);

    expect(write).toBeNull();
  });
});

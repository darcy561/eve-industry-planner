import { describe, expect, it } from "vitest";
import { jobWriteEnvelope, writeBody } from "./jobWrite.js";
import { toDocument } from "../jobDocument.js";

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
    ...over,
  };
}

describe("a write the reader's changes are known for", () => {
  it("carries the fields that changed, checked against the revision behind them", () => {
    const write = jobWriteEnvelope(job(), [entry(changed(["name"]))]);

    expect(write).toEqual({
      jobID: "job-1",
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

describe("a log that leaves nothing to write", () => {
  it("is no write at all", () => {
    const write = jobWriteEnvelope(job(), [
      entry(changed(["build", "materials", "99", "volume"])),
    ]);

    expect(write).toBeNull();
  });
});

const jobWithRows = () => ({
  jobID: "job-1",
  parentJobs: ["job-9", "job-8"],
  name: "A job",
  build: {
    childJobs: { 34: ["job-7", "job-6"] },
    materials: {
      34: { typeID: 34, quantity: 100, purchasing: { "p-1": { cost: 5 } } },
      35: { typeID: 35, quantity: 200, purchasing: {} },
    },
    extrasCosts: { "e-1": { amount: 10 }, "e-2": { amount: 20 } },
    setup: { "s-1": { runCount: 1 } },
  },
  esi: {
    industryJobs: { 500001: { job_id: 500001 }, 500002: { job_id: 500002 } },
    marketOrders: {},
  },
});

describe("what a write carries", () => {
  it("carries the field that changed and nothing beside it", () => {
    const body = writeBody(jobWithRows(), [
      entry(changed(["build", "materials", "34", "quantity"])),
    ]);

    expect(body).toEqual({
      document: { build: { materials: { 34: { quantity: 100 } } } },
      removed: [],
    });
  });

  it("sends one field once however many times it was changed", () => {
    const body = writeBody(jobWithRows(), [
      entry(changed(["name"])),
      entry(changed(["name"])),
    ]);

    expect(body.document).toEqual({ name: "A job" });
  });

  it("reads the value the job ended on, not the one the patch carried", () => {
    const document = jobWithRows();
    document.name = "Renamed twice";

    const body = writeBody(document, [entry(changed(["name"]))]);

    expect(body.document.name).toBe("Renamed twice");
  });

  it("keeps two fields that cover different ground", () => {
    const body = writeBody(jobWithRows(), [
      entry(changed(["build", "extrasCosts", "e-1", "amount"])),
      entry(changed(["name"])),
    ]);

    expect(body.document).toEqual({
      name: "A job",
      build: { extrasCosts: { "e-1": { amount: 10 } } },
    });
  });

  it("drops a field a collection it sits in is already sending", () => {
    const body = writeBody(jobWithRows(), [
      entry(changed(["esi", "industryJobs", "500002", "job_id"])),
      entry(changed(["esi", "industryJobs"])),
    ]);

    expect(body.document).toEqual({
      esi: {
        industryJobs: {
          500001: { job_id: 500001 },
          500002: { job_id: 500002 },
        },
      },
    });
  });

  it("leaves out a path the job no longer has anything at", () => {
    const body = writeBody(jobWithRows(), [
      entry(changed(["build", "materials", "99", "quantity"])),
    ]);

    expect(body.document).toEqual({});
  });

  it("carries nothing for a log that changed nothing", () => {
    expect(writeBody(jobWithRows(), [])).toEqual({ document: {}, removed: [] });
    expect(writeBody(jobWithRows(), undefined)).toEqual({
      document: {},
      removed: [],
    });
  });
});

describe("what a write removes", () => {
  it("names the collection a removed row was in and the key that went", () => {
    const document = jobWithRows();
    delete document.esi.industryJobs["500001"];

    const body = writeBody(document, [
      entry(changed(["esi", "industryJobs", "500001"], "remove")),
    ]);

    expect(body).toEqual({
      document: {},
      removed: [["esi", "industryJobs", "500001"]],
    });
  });

  it("does not send the collection a removal happened in", () => {
    const document = jobWithRows();
    delete document.build.extrasCosts["e-1"];

    const body = writeBody(document, [
      entry(changed(["build", "extrasCosts", "e-1"], "remove")),
    ]);

    expect(body.document).toEqual({});
    expect(body.removed).toEqual([["build", "extrasCosts", "e-1"]]);
  });

  it("gathers two removals from one collection into one list", () => {
    const document = jobWithRows();
    delete document.build.extrasCosts["e-1"];
    delete document.build.extrasCosts["e-2"];

    const body = writeBody(document, [
      entry(changed(["build", "extrasCosts", "e-1"], "remove")),
      entry(changed(["build", "extrasCosts", "e-2"], "remove")),
    ]);

    expect(body.removed).toEqual([
      ["build", "extrasCosts", "e-1"],
      ["build", "extrasCosts", "e-2"],
    ]);
  });

  it("reaches a collection nested inside a row", () => {
    const document = jobWithRows();
    delete document.build.materials["34"].purchasing["p-1"];

    const body = writeBody(document, [
      entry(
        changed(["build", "materials", "34", "purchasing", "p-1"], "remove"),
      ),
    ]);

    expect(body.removed).toEqual([
      ["build", "materials", "34", "purchasing", "p-1"],
    ]);
  });

  it("carries an added row as itself", () => {
    const body = writeBody(jobWithRows(), [
      entry(changed(["esi", "industryJobs", "500002"], "add")),
    ]);

    expect(body).toEqual({
      document: { esi: { industryJobs: { 500002: { job_id: 500002 } } } },
      removed: [],
    });
  });

  it("leaves out a removal inside a collection being written whole", () => {
    const document = jobWithRows();
    delete document.esi.industryJobs["500001"];

    const body = writeBody(document, [
      entry(changed(["esi", "industryJobs"])),
      entry(changed(["esi", "industryJobs", "500001"], "remove")),
    ]);

    expect(body.document).toEqual({
      esi: { industryJobs: { 500002: { job_id: 500002 } } },
    });
    expect(body.removed).toEqual([]);
  });

  it("leaves out a removal the reader undid before the write", () => {
    const body = writeBody(jobWithRows(), [
      entry(changed(["build", "extrasCosts", "e-1"], "remove")),
      entry(changed(["build", "extrasCosts", "e-1"], "add")),
    ]);

    expect(body.removed).toEqual([]);
    expect(body.document).toEqual({
      build: { extrasCosts: { "e-1": { amount: 10 } } },
    });
  });

  it("leaves out a removal of a row the job still has", () => {
    const body = writeBody(jobWithRows(), [
      entry(changed(["build", "extrasCosts", "e-1"], "remove")),
    ]);

    expect(body.removed).toEqual([]);
  });

  it("removes a row the reader changed before deleting it", () => {
    const document = jobWithRows();
    delete document.build.extrasCosts["e-1"];

    const body = writeBody(document, [
      entry(changed(["build", "extrasCosts", "e-1"])),
      entry(changed(["build", "extrasCosts", "e-1"], "remove")),
    ]);

    expect(body.document).toEqual({});
    expect(body.removed).toEqual([["build", "extrasCosts", "e-1"]]);
  });

  it("keeps the shorter of two removals that cover the same ground", () => {
    const document = jobWithRows();
    delete document.build.materials["34"];

    const body = writeBody(document, [
      entry(
        changed(["build", "materials", "34", "purchasing", "p-1"], "remove"),
      ),
      entry(changed(["build", "materials", "34"], "remove")),
    ]);

    expect(body.removed).toEqual([["build", "materials", "34"]]);
  });

  it("names the collection that went, not the rows that went with it", () => {
    const document = jobWithRows();
    delete document.build.extrasCosts;

    const body = writeBody(document, [
      entry(changed(["build", "extrasCosts", "e-1", "amount"])),
      entry(changed(["build", "extrasCosts", "e-1"], "remove")),
      entry(changed(["build", "extrasCosts"], "remove")),
    ]);

    expect(body.document).toEqual({});
    expect(body.removed).toEqual([["build", "extrasCosts"]]);
  });

  it("names a removed row and a removal inside a sibling row together", () => {
    const document = jobWithRows();
    delete document.build.materials["34"];
    delete document.build.materials["35"].purchasing;

    const body = writeBody(document, [
      entry(changed(["build", "materials", "34"], "remove")),
      entry(changed(["build", "materials", "35", "purchasing"], "remove")),
    ]);

    expect(body.removed).toEqual([
      ["build", "materials", "34"],
      ["build", "materials", "35", "purchasing"],
    ]);
  });

  it("writes a list whole rather than clearing a row out of it", () => {
    const document = jobWithRows();
    document.parentJobs = ["job-9"];

    const body = writeBody(document, [
      entry(changed(["parentJobs", 0], "remove")),
    ]);

    expect(body.document).toEqual({ parentJobs: ["job-9"] });
    expect(body.removed).toEqual([]);
  });

  it("writes a list inside a row whole rather than clearing a row out of it", () => {
    const document = jobWithRows();
    document.build.childJobs = { 34: ["job-7"] };

    const body = writeBody(document, [
      entry(changed(["build", "childJobs", "34", 1], "remove")),
    ]);

    expect(body.document).toEqual({ build: { childJobs: { 34: ["job-7"] } } });
    expect(body.removed).toEqual([]);
  });

  it("refuses to remove a field from the job itself", () => {
    expect(() =>
      writeBody(jobWithRows(), [entry(changed(["build"], "remove"))]),
    ).toThrow(/cannot be removed from the job/);
  });
});

import { describe, expect, it } from "vitest";

import { writeBody } from "./writeBody.js";

/** An entry as the draft log records one: what changed, as paths. */
const entry = (...patches) => ({ patches });
const changed = (path, op = "replace") => ({ op, path });

const job = () => ({
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
    const body = writeBody(job(), [
      entry(changed(["build", "materials", "34", "quantity"])),
    ]);

    expect(body).toEqual({
      document: { build: { materials: { 34: { quantity: 100 } } } },
      removed: [],
    });
  });

  it("sends one field once however many times it was changed", () => {
    const body = writeBody(job(), [
      entry(changed(["name"])),
      entry(changed(["name"])),
    ]);

    expect(body.document).toEqual({ name: "A job" });
  });

  it("reads the value the job ended on, not the one the patch carried", () => {
    const document = job();
    document.name = "Renamed twice";

    const body = writeBody(document, [entry(changed(["name"]))]);

    expect(body.document.name).toBe("Renamed twice");
  });

  it("keeps two fields that cover different ground", () => {
    const body = writeBody(job(), [
      entry(changed(["build", "extrasCosts", "e-1", "amount"])),
      entry(changed(["name"])),
    ]);

    expect(body.document).toEqual({
      name: "A job",
      build: { extrasCosts: { "e-1": { amount: 10 } } },
    });
  });

  it("drops a field a collection it sits in is already sending", () => {
    const body = writeBody(job(), [
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
    const body = writeBody(job(), [
      entry(changed(["build", "materials", "99", "quantity"])),
    ]);

    expect(body.document).toEqual({});
  });

  it("carries nothing for a log that changed nothing", () => {
    expect(writeBody(job(), [])).toEqual({ document: {}, removed: [] });
    expect(writeBody(job(), undefined)).toEqual({ document: {}, removed: [] });
  });
});

describe("what a write removes", () => {
  it("names the collection a removed row was in and the key that went", () => {
    const document = job();
    delete document.esi.industryJobs["500001"];

    const body = writeBody(document, [
      entry(changed(["esi", "industryJobs", "500001"], "remove")),
    ]);

    expect(body).toEqual({
      document: {},
      removed: [["esi", "industryJobs", "500001"]],
    });
  });

  // The rows that stayed are not written, which is the point of saying the
  // removal rather than replacing the map it happened in.
  it("does not send the collection a removal happened in", () => {
    const document = job();
    delete document.build.extrasCosts["e-1"];

    const body = writeBody(document, [
      entry(changed(["build", "extrasCosts", "e-1"], "remove")),
    ]);

    expect(body.document).toEqual({});
    expect(body.removed).toEqual([["build", "extrasCosts", "e-1"]]);
  });

  it("gathers two removals from one collection into one list", () => {
    const document = job();
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
    const document = job();
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
    const body = writeBody(job(), [
      entry(changed(["esi", "industryJobs", "500002"], "add")),
    ]);

    expect(body).toEqual({
      document: { esi: { industryJobs: { 500002: { job_id: 500002 } } } },
      removed: [],
    });
  });

  // Naming the same ground twice is what a stored document refuses, so a row
  // removed from a collection the write already carries whole is left out.
  it("leaves out a removal inside a collection being written whole", () => {
    const document = job();
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
    const body = writeBody(job(), [
      entry(changed(["build", "extrasCosts", "e-1"], "remove")),
      entry(changed(["build", "extrasCosts", "e-1"], "add")),
    ]);

    expect(body.removed).toEqual([]);
    expect(body.document).toEqual({
      build: { extrasCosts: { "e-1": { amount: 10 } } },
    });
  });

  // A write is built against the job as it now reads, which a reload can have
  // replaced since the log recorded the removal. Removing a row that is there
  // would delete something nothing asked to delete.
  it("leaves out a removal of a row the job still has", () => {
    const body = writeBody(job(), [
      entry(changed(["build", "extrasCosts", "e-1"], "remove")),
    ]);

    expect(body.removed).toEqual([]);
  });

  // A row edited and then deleted in one editing session is named by both a
  // change and a removal. The change goes nowhere, so the removal has to stand
  // or nothing in the write says the row went.
  it("removes a row the reader changed before deleting it", () => {
    const document = job();
    delete document.build.extrasCosts["e-1"];

    const body = writeBody(document, [
      entry(changed(["build", "extrasCosts", "e-1"])),
      entry(changed(["build", "extrasCosts", "e-1"], "remove")),
    ]);

    expect(body.document).toEqual({});
    expect(body.removed).toEqual([["build", "extrasCosts", "e-1"]]);
  });

  it("keeps the shorter of two removals that cover the same ground", () => {
    const document = job();
    delete document.build.materials["34"];

    const body = writeBody(document, [
      entry(
        changed(["build", "materials", "34", "purchasing", "p-1"], "remove"),
      ),
      entry(changed(["build", "materials", "34"], "remove")),
    ]);

    expect(body.removed).toEqual([["build", "materials", "34"]]);
  });

  // Losing the whole collection leaves earlier changes to its rows naming
  // ground the job no longer has, and the removal belongs at the level that
  // actually went rather than at each row inside it.
  it("names the collection that went, not the rows that went with it", () => {
    const document = job();
    delete document.build.extrasCosts;

    const body = writeBody(document, [
      entry(changed(["build", "extrasCosts", "e-1", "amount"])),
      entry(changed(["build", "extrasCosts", "e-1"], "remove")),
      entry(changed(["build", "extrasCosts"], "remove")),
    ]);

    expect(body.document).toEqual({});
    expect(body.removed).toEqual([["build", "extrasCosts"]]);
  });

  // The shape a tree could not hold: a row gone from a collection, and a row
  // gone from inside a sibling row of that same collection.
  it("names a removed row and a removal inside a sibling row together", () => {
    const document = job();
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

  // Clearing one element of a list by path leaves a hole where the row was, so
  // the list is written whole and nothing is reported removed.
  it("writes a list whole rather than clearing a row out of it", () => {
    const document = job();
    document.parentJobs = ["job-9"];

    const body = writeBody(document, [
      entry(changed(["parentJobs", 0], "remove")),
    ]);

    expect(body.document).toEqual({ parentJobs: ["job-9"] });
    expect(body.removed).toEqual([]);
  });

  it("writes a list inside a row whole rather than clearing a row out of it", () => {
    const document = job();
    document.build.childJobs = { 34: ["job-7"] };

    const body = writeBody(document, [
      entry(changed(["build", "childJobs", "34", 1], "remove")),
    ]);

    expect(body.document).toEqual({ build: { childJobs: { 34: ["job-7"] } } });
    expect(body.removed).toEqual([]);
  });

  // A job has no optional top-level field, so this is a command defect rather
  // than a write shape — a stored job missing one cannot be read back.
  it("refuses to remove a field from the job itself", () => {
    expect(() =>
      writeBody(job(), [entry(changed(["build"], "remove"))]),
    ).toThrow(/cannot be removed from the job/);
  });
});

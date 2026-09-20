import { describe, it, expect, vi } from "vitest";

vi.mock("../Zustand/usersStore", async () => {
  const { usersStoreMock } = await import("../tests/usersStoreHarness.js");
  return usersStoreMock({ account: { accountID: "acct-store" } });
});

const { default: Job } = await import("./job");

// The server owns `_meta`: it overwrites whatever is uploaded and takes identity
// from the request headers. It also rejects unknown fields, so a stale key in a
// PUT body is a 400 rather than a field that is quietly ignored.
describe("Job _meta", () => {
  it("never sends an account or owner back to the server", () => {
    const job = new Job({
      jobID: "job-1",
      itemID: 34,
      _meta: {
        accountID: "acct-from-server",
        owner: { kind: "account", id: "x" },
      },
    });

    const sent = job.toDocument()._meta;

    expect(sent).not.toHaveProperty("accountID");
    expect(sent).not.toHaveProperty("owner");
    expect(sent).not.toHaveProperty("corporationRef");
    expect(sent).not.toHaveProperty("allianceRef");
  });

  it("keeps the fields the client is allowed to round-trip", () => {
    const job = new Job({
      jobID: "job-1",
      itemID: 34,
      _meta: {
        lastModified: "2026-01-01T00:00:00Z",
        createdAt: "2025-01-01T00:00:00Z",
      },
    });

    const sent = job.toDocument()._meta;

    expect(sent.lastModified).toBe("2026-01-01T00:00:00Z");
    expect(sent.createdAt).toBe("2025-01-01T00:00:00Z");
  });

  it("takes lastUpdatedBy from the store when the document carries none", () => {
    const job = new Job({ jobID: "job-1", itemID: 34 });
    expect(job.toDocument()._meta.lastUpdatedBy).toBe("acct-store");
  });
});

// Skills are stored keyed by the typeID each row carries, and held in memory as
// the array every reader of `job.skills` walks. The constructor is fed its own
// output as well as stored documents, so both shapes have to arrive intact.
describe("Job skills", () => {
  const skillRows = [
    { typeID: 22242, level: 4 },
    { typeID: 3380, level: 3 },
  ];

  it("reads a keyed document into the keyed shape its readers walk", () => {
    const job = new Job({
      jobID: "job-1",
      itemID: 34,
      skills: {
        22242: { typeID: 22242, level: 4 },
        3380: { typeID: 3380, level: 3 },
      },
    });

    expect(job.skills).toEqual({
      22242: { typeID: 22242, level: 4 },
      3380: { typeID: 3380, level: 3 },
    });
  });

  it("stores them keyed by typeID", () => {
    const job = new Job({ jobID: "job-1", itemID: 34, skills: skillRows });

    expect(job.toDocument().skills).toEqual({
      22242: { typeID: 22242, level: 4 },
      3380: { typeID: 3380, level: 3 },
    });
  });

  it("survives being rebuilt from its own document", () => {
    const once = new Job({ jobID: "job-1", itemID: 34, skills: skillRows });
    const twice = new Job(once.toDocument());

    expect(twice.skills).toEqual({
      22242: { typeID: 22242, level: 4 },
      3380: { typeID: 3380, level: 3 },
    });
  });

  it("drops a row carrying no typeID rather than filing it under one key", () => {
    const job = new Job({
      jobID: "job-1",
      itemID: 34,
      skills: [{ level: 4 }, { level: 3 }],
    });

    expect(job.toDocument().skills).toEqual({});
  });

  it("has no skills when the document carries none", () => {
    const job = new Job({ jobID: "job-1", itemID: 34 });

    expect(job.skills).toEqual({});
    expect(job.toDocument().skills).toEqual({});
  });
});

// The SPA half of what `models.Job`'s TestKeyedCollectionsSurviveTheWritePath
// asserts on the backend: a collection held keyed has to be written back keyed,
// or the first save after the reshape stores an array over a converted document.
//
// The instance holds each collection keyed whatever the document it was read
// from held, so only the document says whether the write path kept it that way.
// That is the reason this asserts on the document rather than on the instance.
describe("Job writes keyed collections back keyed", () => {
  const job = () =>
    new Job({
      jobID: "job-1",
      itemID: 34,
      jobType: 1,
      skills: { 22242: { typeID: 22242, level: 4 } },
      build: {
        materials: {
          34: {
            typeID: 34,
            purchasing: { p1: { id: "p1", itemCount: 1, itemCost: 1 } },
          },
        },
        extrasCosts: { e1: { id: "e1", extraValue: 3 } },
        inventionEntries: {
          i1: { id: "i1", itemName: "Datacore", itemCost: 2 },
        },
      },
      esi: {
        industryJobs: { 900: { job_id: 900, cost: 7 } },
        marketOrders: { 700001: { order_id: 700001, fee: 5 } },
        transactions: { 800001: { transaction_id: 800001, tax: 1 } },
      },
    });

  it.each([
    ["skills", (d) => d.skills],
    ["build.materials", (d) => d.build.materials],
    [
      "build.materials.34.purchasing",
      (d) => d.build.materials["34"].purchasing,
    ],
    ["build.extrasCosts", (d) => d.build.extrasCosts],
    ["build.inventionEntries", (d) => d.build.inventionEntries],
    ["esi.industryJobs", (d) => d.esi.industryJobs],
    ["esi.marketOrders", (d) => d.esi.marketOrders],
    ["esi.transactions", (d) => d.esi.transactions],
  ])("writes %s as a keyed collection", (_name, read) => {
    const held = read(job().toDocument());

    expect(Array.isArray(held)).toBe(false);
    expect(typeof held).toBe("object");
  });

  // Serialised, not merely present: a collection written straight from the
  // instance carries the live class instances, which are objects and would
  // satisfy the check above while storing a row nothing wrote.
  it("writes plain rows rather than the instances it holds", () => {
    const document = job().toDocument();

    for (const row of [
      ...Object.values(document.build.materials),
      ...Object.values(document.build.extrasCosts),
      ...Object.values(document.build.inventionEntries),
      ...Object.values(document.esi.industryJobs),
      ...Object.values(document.esi.marketOrders),
      ...Object.values(document.esi.transactions),
    ]) {
      expect(row.constructor).toBe(Object);
    }
  });

  // Keyed by the row's own id, not by its position: an array written as an
  // object would satisfy the check above and be filed under "0".
  it("files each row under the id it carries", () => {
    const document = job().toDocument();

    expect(Object.keys(document.skills)).toEqual(["22242"]);
    expect(Object.keys(document.build.materials)).toEqual(["34"]);
    expect(Object.keys(document.build.materials["34"].purchasing)).toEqual([
      "p1",
    ]);
    expect(Object.keys(document.build.extrasCosts)).toEqual(["e1"]);
    expect(Object.keys(document.build.inventionEntries)).toEqual(["i1"]);
  });
});

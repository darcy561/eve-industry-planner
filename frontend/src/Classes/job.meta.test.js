import { describe, it, expect, vi } from "vitest";

vi.mock("../Zustand/usersStore", async () => {
  const { usersStoreMock } = await import("../tests/usersStoreHarness.js");
  return usersStoreMock({ account: { accountID: "acct-store" } });
});

const { jobFromDocument, toDocument } =
  await import("../Functions/JobDocuments/jobDocument.js");

describe("Job _meta", () => {
  it("never sends an account or owner back to the server", () => {
    const job = jobFromDocument({
      jobID: "job-1",
      itemID: 34,
      _meta: {
        accountID: "acct-from-server",
        owner: { kind: "account", id: "x" },
      },
    });

    const sent = toDocument(job)._meta;

    expect(sent).not.toHaveProperty("accountID");
    expect(sent).not.toHaveProperty("owner");
    expect(sent).not.toHaveProperty("corporationRef");
    expect(sent).not.toHaveProperty("allianceRef");
  });

  it("keeps the fields the client is allowed to round-trip", () => {
    const job = jobFromDocument({
      jobID: "job-1",
      itemID: 34,
      _meta: {
        lastModified: "2026-01-01T00:00:00Z",
        createdAt: "2025-01-01T00:00:00Z",
      },
    });

    const sent = toDocument(job)._meta;

    expect(sent.lastModified).toBe("2026-01-01T00:00:00Z");
    expect(sent.createdAt).toBe("2025-01-01T00:00:00Z");
  });

  it("takes lastUpdatedBy from the store when the document carries none", () => {
    const job = jobFromDocument({ jobID: "job-1", itemID: 34 });
    expect(toDocument(job)._meta.lastUpdatedBy).toBe("acct-store");
  });
});

describe("Job skills", () => {
  const skillRows = [
    { typeID: 22242, level: 4 },
    { typeID: 3380, level: 3 },
  ];

  it("reads a keyed document into the keyed shape its readers walk", () => {
    const job = jobFromDocument({
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
    const job = jobFromDocument({
      jobID: "job-1",
      itemID: 34,
      skills: skillRows,
    });

    expect(toDocument(job).skills).toEqual({
      22242: { typeID: 22242, level: 4 },
      3380: { typeID: 3380, level: 3 },
    });
  });

  it("survives being rebuilt from its own document", () => {
    const once = jobFromDocument({
      jobID: "job-1",
      itemID: 34,
      skills: skillRows,
    });
    const twice = jobFromDocument(toDocument(once));

    expect(twice.skills).toEqual({
      22242: { typeID: 22242, level: 4 },
      3380: { typeID: 3380, level: 3 },
    });
  });

  it("drops a row carrying no typeID rather than filing it under one key", () => {
    const job = jobFromDocument({
      jobID: "job-1",
      itemID: 34,
      skills: [{ level: 4 }, { level: 3 }],
    });

    expect(toDocument(job).skills).toEqual({});
  });

  it("has no skills when the document carries none", () => {
    const job = jobFromDocument({ jobID: "job-1", itemID: 34 });

    expect(job.skills).toEqual({});
    expect(toDocument(job).skills).toEqual({});
  });
});

describe("Job writes keyed collections back keyed", () => {
  const job = () =>
    jobFromDocument({
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
    const held = read(toDocument(job()));

    expect(Array.isArray(held)).toBe(false);
    expect(typeof held).toBe("object");
  });

  it("writes plain rows rather than the instances it holds", () => {
    const document = toDocument(job());

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

  it("files each row under the id it carries", () => {
    const document = toDocument(job());

    expect(Object.keys(document.skills)).toEqual(["22242"]);
    expect(Object.keys(document.build.materials)).toEqual(["34"]);
    expect(Object.keys(document.build.materials["34"].purchasing)).toEqual([
      "p1",
    ]);
    expect(Object.keys(document.build.extrasCosts)).toEqual(["e1"]);
    expect(Object.keys(document.build.inventionEntries)).toEqual(["i1"]);
  });
});

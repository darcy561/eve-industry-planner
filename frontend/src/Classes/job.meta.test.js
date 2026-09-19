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

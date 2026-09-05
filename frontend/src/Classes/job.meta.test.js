import { describe, it, expect, vi } from "vitest";

vi.mock("../Zustand/usersStore", () => ({
  default: { getState: () => ({ account: { accountID: "acct-store" } }) },
}));

const { default: Job } = await import("./job");

// The server owns `_meta`: it overwrites whatever is uploaded and takes identity
// from the request headers. It also rejects unknown fields, so a stale key in a
// PUT body is a 400 rather than a field that is quietly ignored.
describe("Job _meta", () => {
  it("never sends an account or owner back to the server", () => {
    const job = new Job({
      jobID: "job-1",
      itemID: 34,
      _meta: { accountID: "acct-from-server", owner: { kind: "account", id: "x" } },
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
      _meta: { lastModified: "2026-01-01T00:00:00Z", createdAt: "2025-01-01T00:00:00Z" },
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

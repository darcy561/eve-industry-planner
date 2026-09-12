import { beforeEach, describe, expect, it, vi } from "vitest";

import { activePlannerStoreState } from "./utils.js";

const storeState = activePlannerStoreState();
storeState.realtimeSync = {
  actions: {
    getCursorMs: () => 0,
    setCursorMs: () => {},
  },
};

vi.mock("../Zustand/usersStore.js", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../tests/usersStoreHarness.js");
  return usersStoreMock(() => usersStoreState(storeState));
});
const enqueued = [];
vi.mock("../Functions/Debounce/inboundJobDocumentsCoalesce.js", () => ({
  enqueueInboundJobDocumentChange: (...args) => enqueued.push(args),
}));

const groupUpserts = [];
vi.mock("../Realtime/handlers/index.js", () => ({
  handleUserJobGroupUpsert: (...args) => groupUpserts.push(args),
  handleUserJobGroupDelete: () => {},
  handleApplicationSettingsDocumentUpsert: () => {},
  handleApplicationSettingsDocumentDelete: () => {},
  handleUsersDocumentUpsert: () => {},
  handleUsersDocumentDelete: () => {},
  handleWatchlistDeprecatedUpsert: () => {},
  handleWatchlistDeprecatedDelete: () => {},
}));

const { applyDocumentMessage } =
  await import("../Realtime/handlers/documentMessage.js");

function groupMessage(owner) {
  return {
    collection: "job_groups",
    docID: "group-1",
    owner,
    operationType: "update",
    document: {
      groupID: "group-1",
      _meta: { lastModified: "2026-01-01T00:00:00Z" },
    },
  };
}

function jobMessage(owner) {
  return {
    collection: "job_documents",
    docID: "job-1",
    owner,
    operationType: "update",
    document: {
      jobID: "job-1",
      _meta: { lastModified: "2026-01-01T00:00:00Z" },
    },
  };
}

// The store holds one planner's jobs, so a document from another would merge
// into them with nothing to tell the two apart.
describe("job documents from a planner the app is not working in", () => {
  beforeEach(() => {
    enqueued.length = 0;
    groupUpserts.length = 0;
    storeState.activePlanner.owner = null;
  });

  it("takes the account's own when no planner has been chosen", async () => {
    await applyDocumentMessage(jobMessage("account:acct-1"));
    expect(enqueued).toHaveLength(1);
  });

  it("ignores another planner's while none has been chosen", async () => {
    await applyDocumentMessage(jobMessage("corporation:98000001"));
    expect(enqueued).toHaveLength(0);
  });

  it("takes the planner it switched to", async () => {
    storeState.activePlanner.owner = "corporation:98000001";
    await applyDocumentMessage(jobMessage("corporation:98000001"));
    expect(enqueued).toHaveLength(1);
  });

  // Switching stops the account's own job feed, which is the point of replacing
  // the subscription rather than widening it.
  it("ignores the account's own once it has switched away", async () => {
    storeState.activePlanner.owner = "corporation:98000001";
    await applyDocumentMessage(jobMessage("account:acct-1"));
    expect(enqueued).toHaveLength(0);
  });

  // A server that names no owner is one this client cannot place the document
  // for, so it is ignored rather than guessed at.
  it("ignores a document that names no owner", async () => {
    await applyDocumentMessage(jobMessage(undefined));
    expect(enqueued).toHaveLength(0);
  });

  // Groups belong to a planner as jobs do, so the same rule applies to them —
  // the guard is on the collection's kind, not on one collection.
  it("applies the same rule to job groups", async () => {
    await applyDocumentMessage(groupMessage("account:acct-1"));
    expect(groupUpserts).toHaveLength(1);

    await applyDocumentMessage(groupMessage("corporation:98000001"));
    expect(groupUpserts).toHaveLength(1);
  });
});

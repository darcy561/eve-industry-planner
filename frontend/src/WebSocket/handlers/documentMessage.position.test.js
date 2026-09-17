import { beforeEach, describe, expect, it, vi } from "vitest";

import { activePlannerStoreState } from "../../tests/utils.js";

const positions = {};
const storeState = activePlannerStoreState();
storeState.websocketSync = {
  positions,
  actions: {
    getPosition: (docKey) => positions[docKey] ?? 0,
    setPosition: vi.fn((docKey, position) => {
      positions[docKey] = position;
    }),
    setPositionBatch: vi.fn(),
    forgetCollection: vi.fn(),
  },
};

vi.mock("../../Zustand/usersStore.js", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../tests/usersStoreHarness.js");
  return usersStoreMock(() => usersStoreState(storeState));
});

const enqueued = [];
vi.mock("../../Functions/Debounce/inboundJobDocumentsCoalesce.js", () => ({
  enqueueInboundJobDocumentChange: (...args) => enqueued.push(args),
}));

const groupUpserts = [];
const groupDeletes = [];
vi.mock("./index.js", () => ({
  handleUserJobGroupUpsert: (...args) => groupUpserts.push(args),
  handleUserJobGroupDelete: (...args) => groupDeletes.push(args),
  handleApplicationSettingsDocumentUpsert: () => {},
  handleApplicationSettingsDocumentDelete: () => {},
  handleUsersDocumentUpsert: () => {},
  handleUsersDocumentDelete: () => {},
  handleWatchlistDeprecatedUpsert: () => {},
  handleWatchlistDeprecatedDelete: () => {},
}));

const { applyDocumentMessage } = await import("./documentMessage.js");

function jobMessage(position) {
  return {
    collection: "job_documents",
    docID: "job-1",
    owner: "account:acct-1",
    operationType: "update",
    position,
    document: {
      jobID: "job-1",
      _meta: { lastModified: "2026-01-01T00:00:00Z" },
    },
  };
}

beforeEach(() => {
  enqueued.length = 0;
  groupUpserts.length = 0;
  groupDeletes.length = 0;
  for (const key of Object.keys(positions)) delete positions[key];
});

// The position is the stream's, so a redelivery repeats it exactly. That is the
// case a stamp taken from the document could never recognise.
describe("deciding whether a delivery has already been applied", () => {
  it("applies a change beyond what this document has seen", async () => {
    positions["job_documents.job-1"] = 10;

    await applyDocumentMessage(jobMessage(11));

    expect(enqueued).toHaveLength(1);
  });

  it("discards a delivery of a change already applied", async () => {
    positions["job_documents.job-1"] = 11;

    await applyDocumentMessage(jobMessage(11));

    expect(enqueued).toHaveLength(0);
  });

  it("discards one from behind the document's position", async () => {
    positions["job_documents.job-1"] = 11;

    await applyDocumentMessage(jobMessage(4));

    expect(enqueued).toHaveLength(0);
  });

  // A delete is a delivery like any other. One from behind the document's
  // position would otherwise remove what a later change already put there —
  // archiving a job and restoring it is that pair, and the delete is the one
  // that arrives twice.
  it("discards a delete from behind the document's position", async () => {
    positions["job_documents.job-1"] = 11;

    await applyDocumentMessage({
      collection: "job_documents",
      docID: "job-1",
      owner: "account:acct-1",
      operationType: "delete",
      position: 4,
    });

    expect(enqueued).toHaveLength(0);
  });

  it("takes a delete beyond the document's position", async () => {
    positions["job_documents.job-1"] = 11;

    await applyDocumentMessage({
      collection: "job_documents",
      docID: "job-1",
      owner: "account:acct-1",
      operationType: "delete",
      position: 12,
    });

    expect(enqueued).toHaveLength(1);
  });

  it("discards a delete for another collection from behind its position", async () => {
    positions["job_groups.group-1"] = 11;

    await applyDocumentMessage({
      collection: "job_groups",
      docID: "group-1",
      owner: "account:acct-1",
      operationType: "delete",
      position: 4,
    });

    expect(groupDeletes).toHaveLength(0);
  });

  // A server that sends no position leaves the client unable to tell, and
  // applying is the answer that loses nothing.
  it("applies a delivery that names no position", async () => {
    positions["job_documents.job-1"] = 11;

    await applyDocumentMessage(jobMessage(undefined));

    expect(enqueued).toHaveLength(1);
  });
});

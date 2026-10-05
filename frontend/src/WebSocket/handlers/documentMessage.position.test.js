import { beforeEach, describe, expect, it, vi } from "vitest";

import { keptPositions } from "../../tests/inboundDelivery.js";
import { activePlannerStoreState } from "../../tests/utils.js";

const positions = {};
const storeState = activePlannerStoreState();
storeState.websocketSync = keptPositions(positions);

vi.mock("../../Zustand/usersStore.js", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../tests/usersStoreHarness.js");
  return usersStoreMock(() => usersStoreState(storeState));
});

const enqueued = [];
vi.mock("../../Functions/Job/sync/inboundJobDocuments.js", () => ({
  enqueueInboundJobDocumentChange: (...args) => enqueued.push(args),
}));

vi.mock("./index.js", async () => {
  const { otherDocumentHandlers } =
    await import("../../tests/inboundDelivery.js");
  return otherDocumentHandlers();
});

const handlers = await import("./index.js");
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
  vi.clearAllMocks();
  for (const key of Object.keys(positions)) delete positions[key];
});

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

    expect(handlers.handleUserJobGroupDelete.mock.calls).toHaveLength(0);
  });

  it("applies a delivery that names no position", async () => {
    positions["job_documents.job-1"] = 11;

    await applyDocumentMessage(jobMessage(undefined));

    expect(enqueued).toHaveLength(1);
  });
});

describe("routing a planner's settings", () => {
  function settingsMessage(owner, operationType) {
    return {
      collection: "planner_settings",
      docID: "corporation:corp_ref_x",
      owner,
      operationType,
      position: 7,
      document: { extrasCategories: [] },
    };
  }

  it("hands an upsert to the settings handler with the owner it named", async () => {
    await applyDocumentMessage(
      settingsMessage("corporation:98000001", "update"),
    );

    expect(handlers.handlePlannerSettingsUpsert.mock.calls).toHaveLength(1);
    expect(handlers.handlePlannerSettingsUpsert.mock.calls[0][0].owner).toBe(
      "corporation:98000001",
    );
  });

  it("hands a delete to the settings handler", async () => {
    await applyDocumentMessage(
      settingsMessage("corporation:98000001", "delete"),
    );

    expect(handlers.handlePlannerSettingsDelete.mock.calls).toHaveLength(1);
  });

  it("discards a redelivery of a settings change already applied", async () => {
    positions["planner_settings.corporation:corp_ref_x"] = 7;

    await applyDocumentMessage(
      settingsMessage("corporation:98000001", "update"),
    );

    expect(handlers.handlePlannerSettingsUpsert.mock.calls).toHaveLength(0);
  });

  it("discards a settings delete from behind the document's position", async () => {
    positions["planner_settings.corporation:corp_ref_x"] = 9;

    await applyDocumentMessage(
      settingsMessage("corporation:98000001", "delete"),
    );

    expect(handlers.handlePlannerSettingsDelete.mock.calls).toHaveLength(0);
  });

  it("takes settings for a planner other than the one being worked in", async () => {
    await applyDocumentMessage(
      settingsMessage("corporation:98000002", "update"),
    );

    expect(handlers.handlePlannerSettingsUpsert.mock.calls).toHaveLength(1);
  });
});

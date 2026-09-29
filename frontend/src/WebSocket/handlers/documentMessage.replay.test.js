import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { heldJobs, keptPositions } from "../../tests/inboundDelivery.js";
import { activePlannerStoreState } from "../../tests/utils.js";

const capture = JSON.parse(
  readFileSync(
    resolve(
      process.cwd(),
      "../testing/fixtures/realtime-messages/job-delta-capture.json",
    ),
    "utf8",
  ),
);

const kinds = ["account", "corporation", "alliance"];

function updateFor(kind) {
  return capture[kind]?.frames.find(
    (frame) =>
      frame.docID === capture[kind].jobID && frame.operationType === "update",
  );
}

const held = { jobs: [] };
const positions = {};
let storeState = activePlannerStoreState();

function storeFor(owner) {
  const state = activePlannerStoreState({ owner });
  state.account.isLoggedIn = true;
  state.jobData = heldJobs(held);
  state.websocketSync = keptPositions(positions);
  return state;
}

vi.mock("../../Zustand/usersStore.js", async () => {
  const { usersStoreMock } = await import("../../tests/usersStoreHarness.js");
  return usersStoreMock(() => storeState);
});

vi.mock(
  "../../Functions/Endpoints/Private/requestJobDocumentsByIds.js",
  () => ({
    requestJobDocumentsByIdsFromApi: () => {
      throw new Error("the replay must not need to read the job again");
    },
  }),
);

const { applyDocumentMessage } = await import("./documentMessage.js");
const { jobFromDocument, toDocument } =
  await import("../../Functions/JobDocuments/jobDocument.js");

beforeEach(() => {
  vi.useFakeTimers();
  held.jobs = [];
  for (const key of Object.keys(positions)) delete positions[key];
});

describe("the capture a live run recorded", () => {
  it("holds every planner kind, so a partial run cannot shrink what is replayed", () => {
    expect(Object.keys(capture).sort()).toEqual([...kinds].sort());
  });

  it("clears a row as well as setting a field, so both halves are replayed", () => {
    for (const kind of kinds) {
      const update = updateFor(kind);
      expect(update.removed, kind).toHaveLength(1);
      expect(
        update.changed.some(({ path }) => path.join(".") === "name"),
        kind,
      ).toBe(true);
    }
  });
});

describe.each(kinds)("what a client was sent for a save in %s", (kind) => {
  const recorded = capture[kind];

  it("is applied onto what it held and arrives at what the server stored", async () => {
    storeState = storeFor(
      recorded.frames.find((frame) => frame.owner)?.owner ?? null,
    );
    held.jobs = [jobFromDocument(recorded.before)];

    for (const frame of recorded.frames) {
      await applyDocumentMessage(frame);
    }
    await vi.advanceTimersByTimeAsync(200);

    const applied = toDocument(
      held.jobs.find((job) => job.jobID === recorded.jobID),
    );
    const stored = toDocument(jobFromDocument(recorded.after));

    expect(applied.name).toBe(stored.name);
    expect(applied._meta.revision).toBe(stored._meta.revision);
    expect(applied).toEqual(stored);
  });
});

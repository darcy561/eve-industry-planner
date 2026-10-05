import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { keptPositions } from "../../tests/inboundDelivery.js";
import { activePlannerStoreState } from "../../tests/utils.js";

const fixture = (name) =>
  JSON.parse(
    readFileSync(resolve(process.cwd(), `../testing/fixtures/${name}`), "utf8"),
  );

const corpus = fixture("realtime-messages/job-delta.json");
const jobSchema = new Set(fixture("model-parity/job-schema.json"));

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

const { applyDocumentMessage } = await import("./documentMessage.js");

function leafPaths(node, at = []) {
  if (node === null || typeof node !== "object" || Array.isArray(node)) {
    return [at];
  }
  return Object.entries(node).flatMap(([key, value]) =>
    leafPaths(value, [...at, key]),
  );
}

function schemaHasChildren(held) {
  for (const path of jobSchema) {
    if (path.startsWith(`${held}.`)) return true;
  }
  return false;
}

function schemaPathFor(path) {
  let held = "";
  for (const step of path) {
    const named = held ? `${held}.${step}` : step;
    const keyed = held ? `${held}.{id}` : "{id}";
    if (jobSchema.has(named)) {
      held = named;
    } else if (jobSchema.has(keyed)) {
      held = keyed;
    } else {
      return null;
    }
  }
  return held;
}

function deliveredMessage() {
  return {
    collection: "job_documents",
    docID: "job-1",
    owner: "account:acct-1",
    operationType: "update",
    position: 11,
    document: {
      jobID: "job-1",
      _meta: { revision: corpus.delivered.revision },
    },
    ...structuredClone(corpus.delivered),
  };
}

beforeEach(() => {
  enqueued.length = 0;
  for (const key of Object.keys(positions)) delete positions[key];
});

describe("the delta a job document's update delivers", () => {
  it("sets only paths the two sides agree a job carries, and only fields inside what it sets whole", () => {
    expect(corpus.delivered.changed.length).toBeGreaterThan(0);
    for (const { path, value } of corpus.delivered.changed) {
      expect(
        schemaPathFor(path),
        `${path.join(".")} is not part of a job`,
      ).not.toBeNull();

      for (const inner of leafPaths(value)) {
        if (inner.length === 0) continue;
        const full = [...path, ...inner];
        const held = schemaPathFor(full);
        expect(
          held,
          `${full.join(".")} is not a field of a job`,
        ).not.toBeNull();
        expect(
          schemaHasChildren(held),
          `${full.join(".")} names something a job holds other fields under, not a value`,
        ).toBe(false);
      }
    }
  });

  it("sets a collection whole where one was emptied, so a client replaces rather than merges", () => {
    const emptied = corpus.delivered.changed.find(
      ({ value }) =>
        value !== null &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        Object.keys(value).length === 0,
    );

    expect(
      emptied,
      "the corpus must carry an emptied collection",
    ).toBeDefined();
    expect(schemaHasChildren(schemaPathFor(emptied.path))).toBe(true);
  });

  it("clears only rows the two sides agree a job carries", () => {
    expect(corpus.delivered.removed.length).toBeGreaterThan(0);
    for (const path of corpus.delivered.removed) {
      expect(schemaPathFor(path), path.join(".")).not.toBeNull();
    }
  });

  it("drops what the server keeps to itself rather than carrying it", () => {
    expect(corpus.stored.updatedFields).toHaveProperty("protected");
    for (const { path } of corpus.delivered.changed) {
      expect(path[0]).not.toBe("protected");
    }
  });

  it("hands the coalescer the delta it read beside the whole document", async () => {
    await applyDocumentMessage(deliveredMessage());

    expect(enqueued).toHaveLength(1);
    const [kind, docID, document, position, delta] = enqueued[0];
    expect(kind).toBe("upsert");
    expect(docID).toBe("job-1");
    expect(document.jobID).toBe("job-1");
    expect(position).toBe(11);
    expect(delta).toEqual(corpus.delivered);
  });
});

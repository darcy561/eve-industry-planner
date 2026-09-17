import { describe, expect, test, vi } from "vitest";
import fs from "node:fs";
import readline from "node:readline";
import { resolve } from "node:path";
import Job from "./job.js";

// What the API hands a client has to survive being made into a Job and written
// back out. The corpus is every job document the stack holds, serialised by the
// Go model exactly as the API serialises it:
//
//   cd testing && go build -o ../.tmp/model_parity ./model_parity
//   ...run it with -phase corpus (see testing/model_parity/main.go)
//   EIP_JOB_CORPUS=../.tmp/model-parity/jobs.jsonl npx vitest run src/Classes/job.parity.test.js
//
// The schema file written beside the corpus lists every path models.Job can
// emit. A field the SPA adds is only a fault when the model has nowhere to put
// it — a field left out of one document under omitempty is not, and the schema
// is the only thing that can tell those apart.
//
// Without the corpus there is nothing to check, so the test skips rather than
// standing in for coverage it does not have.

vi.mock("../Zustand/usersStore", async () => {
  const { usersStoreMock } = await import("../tests/usersStoreHarness.js");
  return usersStoreMock({ account: { accountID: "parity-account" } });
});

// The server owns `_meta` and stamps the schema version on write, so the SPA
// dropping these is the contract rather than a loss.
const SERVER_OWNED = new Set(["schemaVersion", "_meta"]);

// The Go sweep collapses the same shapes from this file, so the two sides always
// agree about which keys name an instance rather than a field.
const instanceKeys = JSON.parse(
  fs.readFileSync(
    resolve(
      process.cwd(),
      "../testing/fixtures/model-parity/instance-keys.json",
    ),
    "utf8",
  ),
);
const INSTANCE_KEY = new RegExp(
  `^(${instanceKeys.patterns.map(({ shape }) => shape).join("|")})$`,
);

/** @param {string} path @returns {string} the path with instance keys collapsed */
function normalisePath(path) {
  return path
    .split(".")
    .map((segment) => {
      const bare = segment.endsWith("[]") ? segment.slice(0, -2) : segment;
      if (!INSTANCE_KEY.test(bare)) return segment;
      return bare === segment ? "{id}" : "{id}[]";
    })
    .join(".");
}

function record(into, path) {
  into.set(path, (into.get(path) ?? 0) + 1);
}

/**
 * Empty says nothing was lost, however it is spelled.
 *
 * The API sends an empty collection as `[]` or `{}`, which is what the SPA
 * builds, so those agree. `null` is still treated as empty here for two reasons:
 * a corpus captured before the wire settled on the empty forms carries it, and a
 * field that is genuinely absent is null on purpose. Neither means a round trip
 * dropped anything, which is the only question this test asks.
 *
 * @param {*} value
 * @returns {boolean}
 */
function isEmpty(value) {
  if (value == null) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value).length === 0;
  return false;
}

/**
 * @param {*} sent - one document as the API serialised it
 * @param {*} written - the same document after `new Job(...).toDocument()`
 * @param {{added: Map, dropped: Map, changed: Map}} found
 */
function compare(sent, written, prefix, found, seen) {
  const sentKeys = sent && typeof sent === "object" ? Object.keys(sent) : [];
  const writtenKeys =
    written && typeof written === "object" ? Object.keys(written) : [];
  for (const key of new Set([...sentKeys, ...writtenKeys])) {
    const path = prefix ? `${prefix}.${key}` : key;
    const normalised = normalisePath(path);
    if (SERVER_OWNED.has(normalised)) continue;
    const inSent = sentKeys.includes(key);
    const inWritten = writtenKeys.includes(key);
    if (inSent && !inWritten) {
      if (!seen.has(`d${normalised}`))
        (seen.add(`d${normalised}`), record(found.dropped, normalised));
      continue;
    }
    if (!inSent && inWritten) {
      if (!seen.has(`a${normalised}`))
        (seen.add(`a${normalised}`), record(found.added, normalised));
      continue;
    }
    const before = sent[key];
    const after = written[key];
    if (isEmpty(before) && isEmpty(after)) continue;
    if (Array.isArray(before) && Array.isArray(after)) {
      if (before.length !== after.length) {
        if (!seen.has(`c${normalised}`))
          (seen.add(`c${normalised}`),
            record(found.changed, `${normalised} (length)`));
        continue;
      }
      for (let i = 0; i < before.length; i++) {
        if (before[i] && typeof before[i] === "object") {
          compare(before[i], after[i], `${path}[]`, found, seen);
        } else if (before[i] !== after[i] && !seen.has(`c${normalised}`)) {
          (seen.add(`c${normalised}`),
            record(found.changed, `${normalised}[]`));
        }
      }
      continue;
    }
    if (
      before &&
      after &&
      typeof before === "object" &&
      typeof after === "object"
    ) {
      compare(before, after, path, found, seen);
      continue;
    }
    // null and undefined both mean "not set" across the boundary.
    if (before !== after && !(before == null && after == null)) {
      if (!seen.has(`c${normalised}`))
        (seen.add(`c${normalised}`), record(found.changed, normalised));
    }
  }
}

/**
 * @param {Map<string, number>} entries - paths against the documents holding them
 * @param {number} scanned
 * @returns {string} one line per path, densest first
 */
function summarise(entries, scanned) {
  return [...entries]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([path, count]) => `  ${path} — ${count}/${scanned}`)
    .join("\n");
}

describe("a job survives the API boundary", () => {
  test("every stored job document round-trips through the Job class", async () => {
    const corpus = process.env.EIP_JOB_CORPUS;
    if (!corpus || !fs.existsSync(corpus)) {
      // eslint-disable-next-line no-console
      console.warn(
        `skipping: set EIP_JOB_CORPUS to a corpus from testing/model_parity`,
      );
      return;
    }
    // The committed fixture rather than one written beside the corpus: this side
    // cannot produce the paths — they come from Go reflection — and a file only
    // written when the Go sweep runs goes stale the moment the model gains a
    // field, which this test then reports as the SPA inventing one. A Go test
    // fails when the fixture and the model disagree.
    const schemaPath = resolve(
      import.meta.dirname,
      "../../../testing/fixtures/model-parity/job-schema.json",
    );
    const modelled = new Set(JSON.parse(fs.readFileSync(schemaPath, "utf8")));

    const found = { added: new Map(), dropped: new Map(), changed: new Map() };
    const failures = new Map();
    let scanned = 0;

    const lines = readline.createInterface({
      input: fs.createReadStream(corpus),
      crlfDelay: Infinity,
    });
    for await (const line of lines) {
      if (!line.trim()) continue;
      const sent = JSON.parse(line);
      scanned++;
      let written;
      try {
        written = new Job(sent).toDocument();
      } catch (error) {
        failures.set(error.message, (failures.get(error.message) ?? 0) + 1);
        continue;
      }
      compare(sent, written, "", found, new Set());
    }

    // A field the model can emit was simply absent from these documents under
    // omitempty; the SPA writing it back is the boundary working.
    const unmodelled = new Map(
      [...found.added].filter(([path]) => !modelled.has(path)),
    );

    expect(scanned).toBeGreaterThan(0);
    expect(failures, `the Job constructor rejected documents`).toEqual(
      new Map(),
    );
    expect(
      found.changed,
      `values changed across the boundary:\n${summarise(found.changed, scanned)}`,
    ).toEqual(new Map());
    expect(
      found.dropped,
      `the SPA dropped fields the API sent:\n${summarise(found.dropped, scanned)}`,
    ).toEqual(new Map());
    expect(
      unmodelled,
      `the SPA sends fields models.Job has nowhere to put, so they are discarded on save:\n${summarise(unmodelled, scanned)}`,
    ).toEqual(new Map());
  }, 600_000);
});

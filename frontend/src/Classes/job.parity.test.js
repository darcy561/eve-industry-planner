import { describe, expect, test, vi } from "vitest";
import fs from "node:fs";
import readline from "node:readline";
import { resolve } from "node:path";
import {
  jobFromDocument,
  toDocument,
} from "../Functions/JobDocuments/jobDocument";

vi.mock("../Zustand/usersStore", async () => {
  const { usersStoreMock } = await import("../tests/usersStoreHarness.js");
  return usersStoreMock({ account: { accountID: "parity-account" } });
});

const SERVER_OWNED = new Set(["schemaVersion", "_meta"]);

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

function isEmpty(value) {
  if (value == null) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value).length === 0;
  return false;
}

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
    if (before !== after && !(before == null && after == null)) {
      if (!seen.has(`c${normalised}`))
        (seen.add(`c${normalised}`), record(found.changed, normalised));
    }
  }
}

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
        written = toDocument(jobFromDocument(sent));
      } catch (error) {
        failures.set(error.message, (failures.get(error.message) ?? 0) + 1);
        continue;
      }
      compare(sent, written, "", found, new Set());
    }

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

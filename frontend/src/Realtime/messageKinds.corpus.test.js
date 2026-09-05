import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  MESSAGE_KINDS,
  MESSAGE_TYPE_DOCUMENT,
  messageFamily,
} from "./messageKinds.js";

// The shared vocabulary, read from the repo root rather than copied here: the
// backend reads the same file, and a message kind may not be added on one side
// alone.
const corpusPath = resolve(
  process.cwd(),
  "../testing/fixtures/realtime-messages/kinds.json",
);
const corpus = JSON.parse(readFileSync(corpusPath, "utf8"));

describe("realtime message kinds", () => {
  test("every family in the corpus is defined here", () => {
    for (const family of corpus.families) {
      expect(MESSAGE_KINDS, family.why).toHaveProperty(family.type);
      const kinds = MESSAGE_KINDS[family.type];
      for (const sub of family.subtypes) {
        expect(kinds, sub.why).toContain(sub.subtype);
      }
      expect(kinds).toHaveLength(family.subtypes.length);
    }
  });

  test("no family is defined here that the corpus does not name", () => {
    const named = corpus.families.map((f) => f.type);
    expect(Object.keys(MESSAGE_KINDS).sort()).toEqual(named.sort());
  });

  test("a message with no type is a document change", () => {
    expect(messageFamily({})).toBe(MESSAGE_TYPE_DOCUMENT);
    expect(messageFamily({ type: "" })).toBe(MESSAGE_TYPE_DOCUMENT);
    expect(messageFamily({ type: "notification" })).toBe("notification");
  });
});

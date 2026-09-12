import { describe, expect, it } from "vitest";
import {
  canonicalCharacterHashKey,
  dedupeLinkedCharacterHashStrings,
  isCharacterInListByHash,
} from "./characterHashCanonical.js";

// A character hash is the owner identity every credential, token and character
// row is keyed by. Two spellings of one hash reading as two characters is what
// this canonicalisation exists to stop, so the cases that matter are the ones
// where a hash arrives in a different case or carries whitespace.

describe("canonicalCharacterHashKey", () => {
  it("lowercases and trims", () => {
    expect(canonicalCharacterHashKey("  AbC123  ")).toBe("abc123");
  });

  it.each([undefined, null, 42, {}, [], "", "   "])(
    "answers empty for %s",
    (input) => {
      expect(canonicalCharacterHashKey(input)).toBe("");
    },
  );
});

describe("isCharacterInListByHash", () => {
  const characters = [{ CharacterHash: "AbC" }, { CharacterHash: "def" }];

  it("matches regardless of case or surrounding space", () => {
    expect(isCharacterInListByHash(characters, "abc")).toBe(true);
    expect(isCharacterInListByHash(characters, "  DEF  ")).toBe(true);
  });

  it("does not match a hash the list does not hold", () => {
    expect(isCharacterInListByHash(characters, "ghi")).toBe(false);
  });

  // An empty hash must never match: it would otherwise claim the first row whose
  // own hash is missing, attaching a credential to the wrong character.
  it.each(["", "   ", null, undefined])("does not match %s", (hash) => {
    expect(isCharacterInListByHash(characters, hash)).toBe(false);
  });

  it("skips rows with no usable hash of their own", () => {
    expect(isCharacterInListByHash([{}, { CharacterHash: null }], "abc")).toBe(
      false,
    );
  });
});

describe("dedupeLinkedCharacterHashStrings", () => {
  // The raw spelling survives — it is what the SSO exchange is given — while the
  // canonical form is only how duplicates are spotted.
  it("keeps the first spelling of each hash", () => {
    expect(
      dedupeLinkedCharacterHashStrings([
        { characterHash: "AbC" },
        { characterHash: "abc" },
        { characterHash: "DEF" },
      ]),
    ).toEqual(["AbC", "DEF"]);
  });

  it("reads either capitalisation of the field name", () => {
    expect(
      dedupeLinkedCharacterHashStrings([
        { CharacterHash: "one" },
        { characterHash: "two" },
      ]),
    ).toEqual(["one", "two"]);
  });

  it("trims what it keeps", () => {
    expect(
      dedupeLinkedCharacterHashStrings([{ characterHash: "  abc  " }]),
    ).toEqual(["abc"]);
  });

  it("drops rows carrying no hash", () => {
    expect(
      dedupeLinkedCharacterHashStrings([
        null,
        "a string",
        {},
        { characterHash: "   " },
        { characterHash: "kept" },
      ]),
    ).toEqual(["kept"]);
  });

  // Null rather than an empty array, so a caller can tell "nothing linked" from
  // "a list that happened to be empty" without checking length.
  it.each([[[]], [null], [undefined], ["not an array"], [{}]])(
    "answers null for %s",
    (input) => {
      expect(dedupeLinkedCharacterHashStrings(input)).toBeNull();
    },
  );

  it("answers null when every row is unusable", () => {
    expect(dedupeLinkedCharacterHashStrings([{}, null])).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import {
  NOTHING_AT_PATH,
  sameValue,
  valueAtPath,
  withValueAtPath,
  withoutValueAtPath,
} from "./documentValues.js";

describe("valueAtPath", () => {
  const document = {
    build: { setup: { s1: { runCount: 3, note: undefined } } },
  };

  it("reads the value a path leads to", () => {
    expect(valueAtPath(document, ["build", "setup", "s1", "runCount"])).toBe(3);
    expect(valueAtPath(document, [])).toBe(document);
  });

  it("tells a stored undefined from a path that leads nowhere", () => {
    expect(
      valueAtPath(document, ["build", "setup", "s1", "note"]),
    ).toBeUndefined();
    expect(valueAtPath(document, ["build", "setup", "s2"])).toBe(
      NOTHING_AT_PATH,
    );
    expect(
      valueAtPath(document, ["build", "setup", "s1", "runCount", "x"]),
    ).toBe(NOTHING_AT_PATH);
    expect(valueAtPath(null, ["build"])).toBe(NOTHING_AT_PATH);
  });
});

describe("sameValue", () => {
  it.each([
    [1, 1],
    ["a", "a"],
    [null, null],
    [undefined, undefined],
    [Number.NaN, Number.NaN],
    [
      { a: 1, b: { c: [1, 2] } },
      { b: { c: [1, 2] }, a: 1 },
    ],
    [[], []],
  ])("holds %j and %j the same", (a, b) => {
    expect(sameValue(a, b)).toBe(true);
  });

  it.each([
    [1, 2],
    [1, "1"],
    [null, {}],
    [undefined, null],
    [{ a: 1 }, { a: 1, b: 2 }],
    [{ a: undefined }, { b: undefined }],
    [
      [1, 2],
      [2, 1],
    ],
    [[], {}],
    [{ a: { b: 1 } }, { a: { b: 2 } }],
  ])("holds %j and %j different", (a, b) => {
    expect(sameValue(a, b)).toBe(false);
  });
});

describe("withValueAtPath", () => {
  it("sets a value on a copy, creating the documents along the way", () => {
    const document = { build: { name: "a" } };

    const next = withValueAtPath(document, ["build", "setup", "s1"], 3);

    expect(next).toEqual({ build: { name: "a", setup: { s1: 3 } } });
    expect(document).toEqual({ build: { name: "a" } });
  });
});

describe("withoutValueAtPath", () => {
  it("removes a value on a copy and leaves a path that leads nowhere alone", () => {
    const document = { build: { a: 1, b: 2 } };

    expect(withoutValueAtPath(document, ["build", "a"])).toEqual({
      build: { b: 2 },
    });
    expect(withoutValueAtPath(document, ["missing", "a"])).toBe(document);
    expect(document).toEqual({ build: { a: 1, b: 2 } });
  });
});

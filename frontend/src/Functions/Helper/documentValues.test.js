import { describe, expect, it } from "vitest";
import { NOTHING_AT_PATH, sameValue, valueAtPath } from "./documentValues.js";

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

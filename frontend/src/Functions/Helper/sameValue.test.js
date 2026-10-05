import { describe, expect, it } from "vitest";
import { sameValue } from "./sameValue.js";

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

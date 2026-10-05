import { describe, expect, it } from "vitest";
import { NOTHING_AT_PATH, valueAtPath } from "./valueAtPath.js";

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

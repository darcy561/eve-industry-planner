import { describe, expect, it } from "vitest";
import { isDeliberateSignout, SIGNOUT_INTENT } from "./signoutIntent.js";

describe("recognising a sign-out the app asked for", () => {
  it("accepts the mark the app sends", () => {
    expect(isDeliberateSignout(SIGNOUT_INTENT)).toBe(true);
  });

  // The first is what a linked or redirected reader actually arrives with; the rest
  // guard the strict `=== true`.
  it.each([
    ["a router's own state", { key: "abc", __TSR_index: 2 }],
    ["a mark of the wrong type", { signOut: "true" }],
    ["a mark that is merely truthy", { signOut: 1 }],
    ["no state at all", undefined],
    ["a missing state", null],
  ])("refuses %s", (_name, state) => {
    expect(isDeliberateSignout(state)).toBe(false);
  });
});

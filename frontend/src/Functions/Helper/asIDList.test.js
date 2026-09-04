import { describe, expect, it } from "vitest";

import asIDList from "./asIDList";

describe("reading a list of ids from what a caller passed", () => {
  it("takes one id, an array, or a set", () => {
    expect(asIDList("job-1")).toEqual(["job-1"]);
    expect(asIDList(["job-1", "job-2"])).toEqual(["job-1", "job-2"]);
    expect(asIDList(new Set(["job-1", "job-2"]))).toEqual(["job-1", "job-2"]);
    expect(asIDList(42)).toEqual([42]);
  });

  // The callers are mutations: refusing loudly would leave them half done, so
  // a caller that must not run on nothing checks before it calls.
  it("reads nothing as no ids rather than refusing", () => {
    expect(asIDList(null)).toEqual([]);
    expect(asIDList(undefined)).toEqual([]);
    expect(asIDList([])).toEqual([]);
    expect(asIDList(new Set())).toEqual([]);
  });

  it("copies rather than handing back what it was given", () => {
    const ids = ["job-1"];
    const result = asIDList(ids);
    result.push("job-2");

    expect(ids).toEqual(["job-1"]);
  });
});

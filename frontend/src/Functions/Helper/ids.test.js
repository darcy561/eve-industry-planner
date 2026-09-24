import { describe, expect, it } from "vitest";

import {
  addIDsToSet,
  asIDList,
  asNumberID,
  asNumberIDList,
  asNumberIDSet,
  asStringID,
  asStringIDList,
  asStringIDSet,
  isGroupID,
  isJobID,
  removeIDsFromSet,
  sameID,
} from "./ids";

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

describe("reading a single id", () => {
  // Job and group ids are strings the planner mints.
  it("reads a string id, whatever it arrived as", () => {
    expect(asStringID("job-1")).toBe("job-1");
    expect(asStringID(587)).toBe("587");
    expect(asStringID(null)).toBeNull();
    expect(asStringID(undefined)).toBeNull();
  });

  // Type, order and run ids are numbers EVE issues, and a document can hold
  // them as the string it was written with.
  it("reads a number id, whatever it arrived as", () => {
    expect(asNumberID(587)).toBe(587);
    expect(asNumberID("587")).toBe(587);
    expect(asNumberID(" 587 ")).toBe(587);
  });

  // An id is a whole number, and documents have held them as doubles.
  it("truncates an id that arrived with a fraction", () => {
    expect(asNumberID(6440610546.9)).toBe(6440610546);
    expect(asNumberID("6440610546.0")).toBe(6440610546);
    expect(asNumberIDSet([6440610546.9, 6440610546])).toEqual(
      new Set([6440610546]),
    );
  });

  it("refuses what does not read as a number", () => {
    expect(asNumberID("abc")).toBeNull();
    expect(asNumberID("")).toBeNull();
    expect(asNumberID(null)).toBeNull();
    expect(asNumberID(Infinity)).toBeNull();
  });
});

describe("telling whether two ids name the same thing", () => {
  it("matches an id written as text against one written as a number", () => {
    expect(sameID("587", 587)).toBe(true);
    expect(sameID(587, "587")).toBe(true);
  });

  it("separates two different ids", () => {
    expect(sameID(587, 588)).toBe(false);
  });

  // Both reading as nothing would otherwise make every unreadable value equal
  // to every other one.
  it("does not match two ids that read as nothing", () => {
    expect(sameID(null, undefined)).toBe(false);
    expect(sameID(undefined, undefined)).toBe(false);
  });

  it("does not match an id against nothing", () => {
    expect(sameID(587, null)).toBe(false);
    expect(sameID(null, 587)).toBe(false);
  });

  it("does not match an id against one that merely starts the same", () => {
    expect(sameID(34, 345)).toBe(false);
  });
});

describe("building a list of ids", () => {
  // A list keeps the order and the repeats a set would lose, which is what a
  // caller wants when the ids describe a sequence rather than membership.
  it("keeps order and duplicates", () => {
    expect(asStringIDList(["job-2", "job-1", "job-2"])).toEqual([
      "job-2",
      "job-1",
      "job-2",
    ]);
    expect(asNumberIDList(["35", 34, "35"])).toEqual([35, 34, 35]);
  });

  it("leaves out what it cannot read", () => {
    expect(asNumberIDList([34, "abc", null, 35])).toEqual([34, 35]);
    expect(asStringIDList([null, undefined])).toEqual([]);
  });

  it("takes one id as a list of one", () => {
    expect(asStringIDList("job-1")).toEqual(["job-1"]);
    expect(asNumberIDList(587)).toEqual([587]);
    expect(asNumberIDList(null)).toEqual([]);
  });
});

describe("building a set of ids", () => {
  // A set of "587" never matches a lookup for 587, which is why the two kinds
  // of id are read apart.
  it("holds string ids as strings and number ids as numbers", () => {
    expect(asStringIDSet([587, "587"])).toEqual(new Set(["587"]));
    expect(asNumberIDSet(["587", 587])).toEqual(new Set([587]));
  });

  it("takes one id, a list, or a set", () => {
    expect(asNumberIDSet(587)).toEqual(new Set([587]));
    expect(asNumberIDSet([34, 35])).toEqual(new Set([34, 35]));
    expect(asNumberIDSet(new Set([34, 35]))).toEqual(new Set([34, 35]));
    expect(asStringIDSet(null)).toEqual(new Set());
  });

  it("leaves out what it cannot read", () => {
    expect(asNumberIDSet([34, "abc", null, 35])).toEqual(new Set([34, 35]));
    expect(asStringIDSet(["job-1", null, "job-2"])).toEqual(
      new Set(["job-1", "job-2"]),
    );
  });
});

describe("changing a set of ids", () => {
  it("adds and removes, reading each id first", () => {
    const ids = new Set([34]);

    addIDsToSet(ids, ["35", 36], asNumberID);
    expect(ids).toEqual(new Set([34, 35, 36]));

    removeIDsFromSet(ids, "35", asNumberID);
    expect(ids).toEqual(new Set([34, 36]));
  });

  it("leaves the set alone for nothing, and for what it cannot read", () => {
    const ids = new Set([34]);

    addIDsToSet(ids, null, asNumberID);
    addIDsToSet(ids, "abc", asNumberID);
    removeIDsFromSet(ids, undefined, asNumberID);

    expect(ids).toEqual(new Set([34]));
  });
});

// A caller holding ids in a Map reaches for `.keys()` or `.values()`, which is an iterator rather
// than an array. Read as one value it becomes a single unreadable id, and the whole list is lost.
describe("ids held in something other than an array", () => {
  it("reads a Map's values", () => {
    const held = new Map([
      ["a", 60003760],
      ["b", 30000142],
    ]);

    expect(asNumberIDList(held.values())).toEqual([60003760, 30000142]);
  });

  it("reads a Map's keys", () => {
    const held = new Map([
      [60003760, "Jita"],
      [30000142, "Jita"],
    ]);

    expect(asNumberIDSet(held.keys())).toEqual(new Set([60003760, 30000142]));
  });

  it("still reads a string as one id, not as its characters", () => {
    expect(asStringIDList("587")).toEqual(["587"]);
  });
});

describe("telling a job id from a group id", () => {
  it("reads the ids the planner mints", () => {
    expect(isJobID("job-3f2a")).toBe(true);
    expect(isGroupID("job-3f2a")).toBe(false);
    expect(isGroupID("group-9c1b")).toBe(true);
    expect(isJobID("group-9c1b")).toBe(false);
  });

  it("calls an id that is neither one neither", () => {
    for (const id of ["", "60003760", null, undefined, 587, {}]) {
      expect(isJobID(id)).toBe(false);
      expect(isGroupID(id)).toBe(false);
    }
  });
});

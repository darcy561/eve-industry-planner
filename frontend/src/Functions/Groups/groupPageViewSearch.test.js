import { describe, expect, it } from "vitest";

import {
  editJobSearchToCarry,
  routeBackFromEditJob,
} from "./groupPageViewSearch";

describe("editJobSearchToCarry", () => {
  it("carries the group and the group page's view", () => {
    expect(
      editJobSearchToCarry({
        activeGroup: "group-1",
        pageView: "jobTree",
        focusJobId: "job-9",
      }),
    ).toEqual({ activeGroup: "group-1", pageView: "jobTree" });
  });

  it("drops what is empty or absent", () => {
    expect(editJobSearchToCarry({ activeGroup: "", pageView: null })).toEqual(
      {},
    );
    expect(editJobSearchToCarry(undefined)).toEqual({});
  });
});

describe("routeBackFromEditJob", () => {
  it("returns to the group and its view", () => {
    expect(
      routeBackFromEditJob({ activeGroup: "g1", pageView: "jobTree" }, "j1"),
    ).toEqual({
      to: "/group/$groupID",
      params: { groupID: "g1" },
      search: { pageView: "jobTree", focusJobId: "j1" },
    });
  });

  it("returns to the planner for a job opened from there", () => {
    expect(routeBackFromEditJob({}, "j1")).toEqual({ to: "/jobplanner" });
  });
});

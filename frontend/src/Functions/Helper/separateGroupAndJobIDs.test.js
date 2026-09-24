import { describe, expect, it, vi } from "vitest";

import separateGroupAndJobIDs from "./separateGroupAndJobIDs";

describe("separating a mixed selection into groups and jobs", () => {
  it("reads one id, an array, or a set", () => {
    expect(separateGroupAndJobIDs("job-1")).toEqual({
      groupIDs: [],
      jobIDs: ["job-1"],
    });
    expect(separateGroupAndJobIDs(["group-1", "job-1"])).toEqual({
      groupIDs: ["group-1"],
      jobIDs: ["job-1"],
    });
    expect(separateGroupAndJobIDs(new Set(["group-1", "job-1"]))).toEqual({
      groupIDs: ["group-1"],
      jobIDs: ["job-1"],
    });
  });

  it("drops anything that names neither, rather than guessing at it", () => {
    expect(separateGroupAndJobIDs(["job-1", 60003760, null, ""])).toEqual({
      groupIDs: [],
      jobIDs: ["job-1"],
    });
  });

  it("returns each id once", () => {
    expect(separateGroupAndJobIDs(["job-1", "job-1", "group-1"])).toEqual({
      groupIDs: ["group-1"],
      jobIDs: ["job-1"],
    });
  });

  it("refuses an input it cannot read as ids", () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(separateGroupAndJobIDs(undefined)).toEqual({
      groupIDs: [],
      jobIDs: [],
    });
    expect(logged).toHaveBeenCalled();

    logged.mockRestore();
  });
});

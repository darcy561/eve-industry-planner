import { describe, expect, it, vi } from "vitest";
import { workingGroups, workingJobs } from "./workingCopies.js";
import { jobFromDocument } from "../jobDocument.js";

vi.mock("../../../Zustand/usersStore", () => ({
  default: { getState: () => ({ account: {} }) },
}));

describe("working copies of planner jobs", () => {
  const held = jobFromDocument({ jobID: "a", name: "Rifter" });
  const find = (jobID) => (jobID === "a" ? held : null);

  it("copies a job the first time it is asked for and hands back the same copy after", () => {
    const working = workingJobs(find);

    const first = working.get("a");
    first.name = "changed";

    expect(first).not.toBe(held);
    expect(held.name).toBe("Rifter");
    expect(working.get("a")).toBe(first);
  });

  it("answers nothing for a job the planner does not hold", () => {
    expect(workingJobs(find).get("missing")).toBeNull();
  });

  it("tells a copy already taken from one never asked for", () => {
    const working = workingJobs(find);

    expect(working.taken("a")).toBeUndefined();
    working.get("a");
    expect(working.taken("a")).toBeDefined();
    expect(working.all()).toHaveLength(1);
  });
});

describe("working copies of planner groups", () => {
  it("rebuilds a group from its document so the planner's own is left alone", () => {
    const source = { groupID: "g", toDocument: () => ({ groupID: "g" }) };

    const copy = workingGroups(() => source).get("g");

    expect(copy).not.toBe(source);
    expect(copy.groupID).toBe("g");
  });
});

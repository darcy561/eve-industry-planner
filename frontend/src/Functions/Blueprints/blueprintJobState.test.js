import { describe, expect, it } from "vitest";

import {
  activeJobsByBlueprint,
  BLUEPRINT_JOB_STATE,
  blueprintJobState,
} from "./blueprintJobState";

describe("blueprintJobState", () => {
  it("says nothing of a blueprint no job is running on", () => {
    expect(blueprintJobState({ isCopy: true, runs: 5 }, null)).toBeNull();
  });

  it("marks an original with a job as running", () => {
    expect(blueprintJobState({ isCopy: false, runs: -1 }, { runs: 99 })).toBe(
      BLUEPRINT_JOB_STATE.RUNNING,
    );
  });

  it("marks a copy the job will use up as running out, and one it will not as running", () => {
    expect(blueprintJobState({ isCopy: true, runs: 10 }, { runs: 10 })).toBe(
      BLUEPRINT_JOB_STATE.RUNS_OUT,
    );
    expect(blueprintJobState({ isCopy: true, runs: 11 }, { runs: 10 })).toBe(
      BLUEPRINT_JOB_STATE.RUNNING,
    );
  });
});

describe("activeJobsByBlueprint", () => {
  it("keys only the jobs running now by their blueprint", () => {
    const running = { blueprint_id: 1, status: "active" };
    const map = activeJobsByBlueprint([
      running,
      { blueprint_id: 2, status: "delivered" },
    ]);

    expect([...map.entries()]).toEqual([[1, running]]);
  });
});

import { enablePatches, produceWithPatches } from "immer";
import { describe, expect, it } from "vitest";
import { restoreOver, reviewChanges } from "./jobDraftReview.js";

enablePatches();

const before = {
  name: "Job",
  build: {
    setup: { s1: { runCount: 10, jobCount: 1 } },
    materials: { 34: { quantity: 100 } },
  },
};

function entries(...recipes) {
  let document = before;
  return recipes.map(([command, recipe], index) => {
    const [next, patches, inversePatches] = produceWithPatches(
      document,
      recipe,
    );
    document = next;
    return {
      seq: index + 1,
      command,
      jobID: "j",
      patches,
      inversePatches,
      at: 0,
    };
  });
}

function outcomes(after, made) {
  return reviewChanges(before, after, made).map(
    ({ entry, outcome, follows }) => ({
      command: entry.command,
      outcome,
      follows,
    }),
  );
}

const withSetup = (setup) => ({ ...before, build: { ...before.build, setup } });

describe("reviewing the reader's changes against a new copy", () => {
  it("applies clean where nothing else touched what it changed", () => {
    const made = entries(["rename", (job) => void (job.name = "mine")]);

    expect(
      outcomes(withSetup({ s1: { runCount: 20, jobCount: 1 } }), made),
    ).toEqual([{ command: "rename", outcome: "clean", follows: undefined }]);
  });

  it("is already done where the copy holds the same value", () => {
    const made = entries(["rename", (job) => void (job.name = "mine")]);

    expect(outcomes({ ...before, name: "mine" }, made)[0].outcome).toBe("done");
  });

  it("is already done where the copy removed the row the reader removed", () => {
    const made = entries([
      "drop material",
      (job) => void delete job.build.materials[34],
    ]);

    expect(
      outcomes(
        { ...before, build: { ...before.build, materials: {} } },
        made,
      )[0].outcome,
    ).toBe("done");
  });

  it("conflicts where the copy set the same place differently", () => {
    const made = entries(["rename", (job) => void (job.name = "mine")]);

    expect(outcomes({ ...before, name: "theirs" }, made)[0].outcome).toBe(
      "conflict",
    );
  });

  it("is gone where what it changed no longer exists", () => {
    const made = entries([
      "set runs",
      (job) => void (job.build.setup.s1.runCount = 40),
    ]);

    expect(outcomes(withSetup({}), made)[0].outcome).toBe("gone");
  });

  it("holds a later change with the held change it builds on", () => {
    const made = entries(
      [
        "add setup",
        (job) => void (job.build.setup.s2 = { runCount: 1, jobCount: 1 }),
      ],
      ["set runs", (job) => void (job.build.setup.s2.runCount = 5)],
    );

    expect(
      outcomes(withSetup({ s2: { runCount: 3, jobCount: 1 } }), made),
    ).toEqual([
      { command: "add setup", outcome: "conflict", follows: undefined },
      { command: "set runs", outcome: "conflict", follows: 1 },
    ]);
  });

  it("judges a later change on top of the earlier ones that still apply", () => {
    const made = entries(
      [
        "add setup",
        (job) => void (job.build.setup.s2 = { runCount: 1, jobCount: 1 }),
      ],
      ["set runs", (job) => void (job.build.setup.s2.runCount = 5)],
    );

    expect(outcomes({ ...before, name: "theirs" }, made)).toEqual([
      { command: "add setup", outcome: "clean", follows: undefined },
      { command: "set runs", outcome: "clean", follows: undefined },
    ]);
  });

  it("states what the reader set at each place, and nothing where they removed it", () => {
    const made = entries([
      "rework",
      (job) => {
        job.name = "mine";
        delete job.build.materials[34];
      },
    ]);

    const { changes } = reviewChanges(
      before,
      { ...before, name: "theirs" },
      made,
    )[0];

    expect(changes).toHaveLength(2);
    expect(changes).toEqual(
      expect.arrayContaining([
        { path: ["name"], mine: "mine" },
        { path: ["build", "materials", "34"], mine: undefined },
      ]),
    );
  });

  it("restores a removed setup as the reader had it, over the new copy", () => {
    const made = entries([
      "set runs",
      (job) => void (job.build.setup.s1.runCount = 40),
    ]);
    const after = withSetup({});

    const [held] = reviewChanges(before, after, made);

    expect(held.restore).toEqual([
      {
        path: ["build", "setup", "s1"],
        value: { runCount: 40, jobCount: 1 },
        removed: false,
      },
    ]);
    expect(restoreOver(after, held.restore).build.setup).toEqual({
      s1: { runCount: 40, jobCount: 1 },
    });
  });

  it("restores the reader's value at the place a conflict set", () => {
    const made = entries(["rename", (job) => void (job.name = "mine")]);

    const [held] = reviewChanges(before, { ...before, name: "theirs" }, made);

    expect(held.restore).toEqual([
      { path: ["name"], value: "mine", removed: false },
    ]);
  });

  it("gives a change that still applies nothing to restore", () => {
    const made = entries(["rename", (job) => void (job.name = "mine")]);

    expect(
      reviewChanges(before, withSetup({}), made)[0].restore,
    ).toBeUndefined();
  });
});

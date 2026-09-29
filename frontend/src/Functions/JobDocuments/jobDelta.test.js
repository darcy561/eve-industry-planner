import { describe, expect, it } from "vitest";

import {
  DELTA_APPLIES,
  DELTA_GAP,
  DELTA_SEEN,
  applyJobDelta,
  deltaFromMessage,
  deltaVerdict,
  revisionOf,
} from "./jobDelta.js";

function job() {
  return {
    jobID: "job-1",
    name: "Before",
    build: {
      materials: { 34: { typeID: 34, volume: 100, name: "Tritanium" } },
      extrasCosts: { "e-1": { id: "e-1", extraValue: 120000 } },
    },
    _meta: { revision: 7, lastModified: "2026-01-01T00:00:00Z" },
  };
}

function delta(overrides = {}) {
  return {
    changed: [{ path: ["name"], value: "After" }],
    removed: [],
    revision: 8,
    appliesTo: 7,
    ...overrides,
  };
}

describe("reading a delta off a delivery", () => {
  it("answers nothing when the message carries no revision pair", () => {
    expect(
      deltaFromMessage({ changed: [{ path: ["name"], value: "After" }] }),
    ).toBeNull();
  });

  it("answers nothing when the message changes and clears nothing", () => {
    expect(
      deltaFromMessage({ revision: 8, appliesTo: 7, changed: [], removed: [] }),
    ).toBeNull();
  });

  it("answers a delta that clears a row and changes nothing", () => {
    const read = deltaFromMessage({
      revision: 8,
      appliesTo: 7,
      removed: [["build", "extrasCosts", "e-1"]],
    });

    expect(read).toMatchObject({ revision: 8, appliesTo: 7, changed: [] });
    expect(read.removed).toHaveLength(1);
  });

  it("answers nothing for a change that names no path", () => {
    expect(
      deltaFromMessage(delta({ changed: [{ path: [], value: "After" }] })),
    ).toBeNull();
    expect(
      deltaFromMessage(delta({ changed: [{ value: "After" }] })),
    ).toBeNull();
  });

  it("answers nothing for a change sent in the nested shape it replaced", () => {
    expect(deltaFromMessage(delta({ changed: { name: "After" } }))).toBeNull();
  });

  it("answers nothing for a cleared row that is not a path", () => {
    expect(deltaFromMessage(delta({ removed: [["build", 7]] }))).toBeNull();
  });
});

describe("whether a delta lands on what a client holds", () => {
  it("applies onto the revision it names", () => {
    expect(deltaVerdict(7, delta())).toBe(DELTA_APPLIES);
  });

  it("is already applied when it produces a revision the client holds", () => {
    expect(deltaVerdict(8, delta())).toBe(DELTA_SEEN);
    expect(deltaVerdict(9, delta())).toBe(DELTA_SEEN);
  });

  it("is a gap when it applies onto a revision that was never held", () => {
    expect(deltaVerdict(6, delta())).toBe(DELTA_GAP);
    expect(deltaVerdict(7, delta({ appliesTo: 8, revision: 9 }))).toBe(
      DELTA_GAP,
    );
  });

  it("is a gap when the client holds no revision at all", () => {
    expect(deltaVerdict(null, delta())).toBe(DELTA_GAP);
    expect(revisionOf({})).toBeNull();
    expect(revisionOf(job())).toBe(7);
  });
});

describe("applying a delta to the document a client holds", () => {
  it("sets a field at its path and leaves the rest of the row alone", () => {
    const applied = applyJobDelta(
      job(),
      delta({
        changed: [
          { path: ["build", "materials", "34", "volume"], value: 4200 },
        ],
      }),
    );

    expect(applied.build.materials["34"]).toEqual({
      typeID: 34,
      volume: 4200,
      name: "Tritanium",
    });
    expect(applied.build.extrasCosts["e-1"]).toBeDefined();
    expect(applied.name).toBe("Before");
  });

  it("empties a collection set whole to nothing, rather than merging into it", () => {
    const applied = applyJobDelta(
      job(),
      delta({ changed: [{ path: ["build", "extrasCosts"], value: {} }] }),
    );

    expect(applied.build.extrasCosts).toEqual({});
    expect(applied.build.materials["34"]).toBeDefined();
  });

  it("drops a field a row set whole no longer has", () => {
    const applied = applyJobDelta(
      job(),
      delta({
        changed: [
          {
            path: ["build", "materials", "34"],
            value: { typeID: 34, volume: 4200 },
          },
        ],
      }),
    );

    expect(applied.build.materials["34"]).toEqual({ typeID: 34, volume: 4200 });
  });

  it("builds the rows above a path the document does not hold yet", () => {
    const applied = applyJobDelta(
      job(),
      delta({
        changed: [
          {
            path: ["build", "setup", "s-1"],
            value: { id: "s-1", jobCount: 2 },
          },
        ],
      }),
    );

    expect(applied.build.setup["s-1"]).toEqual({ id: "s-1", jobCount: 2 });
  });

  it("clears a row it names", () => {
    const applied = applyJobDelta(
      job(),
      delta({ changed: [], removed: [["build", "extrasCosts", "e-1"]] }),
    );

    expect(applied.build.extrasCosts).toEqual({});
    expect(applied.build.materials["34"]).toBeDefined();
  });

  it("ignores a cleared path the document does not hold", () => {
    const applied = applyJobDelta(
      job(),
      delta({
        changed: [],
        removed: [
          ["build", "extrasCosts", "e-9"],
          ["nothing", "here"],
        ],
      }),
    );

    expect(applied.build.extrasCosts["e-1"]).toBeDefined();
  });

  it("moves the revision to the one the delta produced", () => {
    const applied = applyJobDelta(job(), delta());

    expect(applied._meta.revision).toBe(8);
    expect(applied._meta.lastModified).toBe("2026-01-01T00:00:00Z");
  });

  it("leaves the document it was given untouched", () => {
    const held = job();
    applyJobDelta(
      held,
      delta({
        changed: [
          { path: ["build", "materials", "34", "volume"], value: 4200 },
          { path: ["build", "extrasCosts"], value: {} },
        ],
        removed: [["build", "materials", "34"]],
      }),
    );

    expect(held.build.materials["34"].volume).toBe(100);
    expect(held.build.extrasCosts["e-1"]).toBeDefined();
    expect(held._meta.revision).toBe(7);
  });
});

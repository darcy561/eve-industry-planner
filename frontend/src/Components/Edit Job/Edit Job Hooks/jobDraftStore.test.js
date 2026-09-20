import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ask,
  change,
  changedJobIDs,
  committedFor,
  discard,
  draftFor,
  emptyDraftState,
  forgetJob,
  hasChanges,
  keepAsked,
  leaveScratch,
  nextRedo,
  nextUndo,
  redo,
  setBase,
  TYPING_COALESCE_MS,
  undo,
} from "./jobDraftStore";

const document = (overrides = {}) => ({
  jobID: "job-1",
  name: "Job",
  jobStatus: 1,
  build: {
    setup: { "setup-1": { id: "setup-1", runCount: 10 } },
    materials: { 34: { typeID: 34, quantity: 100 } },
  },
  esi: { transactions: {} },
  ...overrides,
});

const holding = (jobID = "job-1", doc = document()) =>
  setBase(emptyDraftState(), jobID, doc);

describe("the job a reader is looking at", () => {
  it("reads as the document until something changes it", () => {
    expect(draftFor(holding(), "job-1")).toEqual(document());
  });

  it("reads back a change", () => {
    const state = change(holding(), "job-1", "set run count", (job) => {
      job.build.setup["setup-1"].runCount = 40;
    });

    expect(draftFor(state, "job-1").build.setup["setup-1"].runCount).toBe(40);
  });

  it("knows nothing about a job it is not holding", () => {
    expect(draftFor(holding(), "job-2")).toBeUndefined();
  });
});

// The base is never written to, which is what lets a change be taken back and
// what lets a document arriving underneath one be applied without disturbing it.
describe("the document underneath", () => {
  it("is not written to by a change", () => {
    const held = document();
    const state = change(holding("job-1", held), "job-1", "set", (job) => {
      job.build.setup["setup-1"].runCount = 40;
    });

    expect(held.build.setup["setup-1"].runCount).toBe(10);
    expect(state.base["job-1"].build.setup["setup-1"].runCount).toBe(10);
  });

  it("keeps the reader's changes when it is replaced", () => {
    const changed = change(holding(), "job-1", "set run count", (job) => {
      job.build.setup["setup-1"].runCount = 40;
    });

    const arrived = setBase(
      changed,
      "job-1",
      document({ name: "Renamed by somebody else" }),
    );
    const draft = draftFor(arrived, "job-1");

    expect(draft.build.setup["setup-1"].runCount).toBe(40);
    expect(draft.name).toBe("Renamed by somebody else");
  });
});

// The whole point of the layers: a reader selecting a part of the job that an
// edit did not touch holds the same object afterwards, so it can be compared by
// identity instead of by value.
describe("what an edit leaves alone", () => {
  it("hands back the same object it was before", () => {
    const held = holding();
    const before = draftFor(held, "job-1");
    const state = change(held, "job-1", "set run count", (job) => {
      job.build.setup["setup-1"].runCount = 40;
    });
    const after = draftFor(state, "job-1");

    expect(after.build.materials).toBe(before.build.materials);
    expect(after.esi).toBe(before.esi);
    expect(after.build.setup["setup-1"]).not.toBe(
      before.build.setup["setup-1"],
    );
  });
});

// A question the player asked. It changes what is on screen and never reaches a
// save, which is what lets a job be stepped back and looked at.
describe("a question, as against a change", () => {
  const asked = () =>
    ask(holding(), "job-1", "look at planning", (job) => {
      job.jobStatus = 0;
    });

  it("shows on screen", () => {
    expect(draftFor(asked(), "job-1").jobStatus).toBe(0);
  });

  it("is left out of what would be saved", () => {
    expect(committedFor(asked(), "job-1").jobStatus).toBe(1);
  });

  it("does not count as having unsaved changes", () => {
    expect(hasChanges(asked())).toBe(false);
  });

  it("wins over the document it is asked about", () => {
    const arrived = setBase(asked(), "job-1", document({ jobStatus: 3 }));

    expect(draftFor(arrived, "job-1").jobStatus).toBe(0);
  });

  it("is not carried into a change recorded while it is on screen", () => {
    const state = change(asked(), "job-1", "set run count", (job) => {
      job.build.setup["setup-1"].runCount = 40;
    });

    expect(committedFor(state, "job-1").jobStatus).toBe(1);
    expect(committedFor(state, "job-1").build.setup["setup-1"].runCount).toBe(
      40,
    );
  });

  it("is kept when the player decides to keep it", () => {
    const state = asked();
    const kept = keepAsked(state, state.scratch[0].seq);

    expect(hasChanges(kept)).toBe(true);
    expect(committedFor(kept, "job-1").jobStatus).toBe(0);
    expect(kept.scratch).toEqual([]);
  });

  it("goes when the player leaves it, and the changes stay", () => {
    const state = change(asked(), "job-1", "set run count", (job) => {
      job.build.setup["setup-1"].runCount = 40;
    });
    const left = draftFor(leaveScratch(state, "job-1"), "job-1");

    expect(left.jobStatus).toBe(1);
    expect(left.build.setup["setup-1"].runCount).toBe(40);
  });
});

describe("whether there is anything to save", () => {
  it("says no for a job nobody has changed", () => {
    expect(hasChanges(holding())).toBe(false);
    expect(hasChanges(holding(), "job-1")).toBe(false);
  });

  it("says yes once something is changed", () => {
    const state = change(holding(), "job-1", "rename", (job) => {
      job.name = "New name";
    });

    expect(hasChanges(state)).toBe(true);
    expect(hasChanges(state, "job-1")).toBe(true);
    expect(hasChanges(state, "job-2")).toBe(false);
  });

  it("ignores a recipe that changed nothing", () => {
    const state = change(holding(), "job-1", "rename", (job) => {
      job.name = "Job";
    });

    expect(hasChanges(state)).toBe(false);
    expect(state.log).toEqual([]);
  });

  it("names every job the reader changed", () => {
    const two = setBase(holding(), "job-2", document({ jobID: "job-2" }));
    const state = change(
      change(two, "job-1", "rename", (job) => {
        job.name = "One";
      }),
      "job-2",
      "rename",
      (job) => {
        job.name = "Two";
      },
    );

    expect(changedJobIDs(state).sort()).toEqual(["job-1", "job-2"]);
  });
});

// Leaving without saving. Nothing is written back, so what arrived while the
// editor was open is what the reader is left on.
describe("dropping what the reader changed", () => {
  it("leaves them on the document as it now stands", () => {
    const changed = change(holding(), "job-1", "set run count", (job) => {
      job.build.setup["setup-1"].runCount = 40;
    });
    const arrived = setBase(
      changed,
      "job-1",
      document({ name: "Renamed by somebody else" }),
    );
    const dropped = draftFor(discard(arrived, "job-1"), "job-1");

    expect(dropped.build.setup["setup-1"].runCount).toBe(10);
    expect(dropped.name).toBe("Renamed by somebody else");
  });

  it("drops the questions with the changes", () => {
    const state = ask(
      change(holding(), "job-1", "rename", (job) => {
        job.name = "New name";
      }),
      "job-1",
      "look",
      (job) => {
        job.jobStatus = 0;
      },
    );
    const dropped = discard(state, "job-1");

    expect(dropped.log).toEqual([]);
    expect(dropped.scratch).toEqual([]);
  });

  it("leaves another job's changes alone", () => {
    const two = setBase(holding(), "job-2", document({ jobID: "job-2" }));
    const state = change(
      change(two, "job-1", "rename", (job) => {
        job.name = "One";
      }),
      "job-2",
      "rename",
      (job) => {
        job.name = "Two";
      },
    );

    expect(changedJobIDs(discard(state, "job-1"))).toEqual(["job-2"]);
  });
});

// An edit session is not one document: linking a child writes the child's
// parents, and close time recalculates the tree.
describe("more than one job at once", () => {
  it("holds each job's changes against its own document", () => {
    const two = setBase(holding(), "job-2", document({ jobID: "job-2" }));
    const state = change(two, "job-2", "rename", (job) => {
      job.name = "Two";
    });

    expect(draftFor(state, "job-1").name).toBe("Job");
    expect(draftFor(state, "job-2").name).toBe("Two");
  });

  it("forgets a job entirely", () => {
    const state = change(holding(), "job-1", "rename", (job) => {
      job.name = "New name";
    });
    const gone = forgetJob(state, "job-1");

    expect(draftFor(gone, "job-1")).toBeUndefined();
    expect(gone.log).toEqual([]);
  });
});

// An entry has to carry what it takes to put the job back, or undo cannot work
// and neither can reviewing a draft against a job that has moved.
describe("what an entry records", () => {
  it("carries what it changed and what puts it back", () => {
    const state = change(holding(), "job-1", "set run count", (job) => {
      job.build.setup["setup-1"].runCount = 40;
    });
    const [entry] = state.log;

    expect(entry.command).toBe("set run count");
    expect(entry.jobID).toBe("job-1");
    expect(entry.patches).toEqual([
      {
        op: "replace",
        path: ["build", "setup", "setup-1", "runCount"],
        value: 40,
      },
    ]);
    expect(entry.inversePatches).toEqual([
      {
        op: "replace",
        path: ["build", "setup", "setup-1", "runCount"],
        value: 10,
      },
    ]);
  });

  it("carries the row back when one is removed", () => {
    const state = change(holding(), "job-1", "remove material", (job) => {
      delete job.build.materials[34];
    });

    expect(state.log[0].inversePatches).toEqual([
      {
        op: "add",
        path: ["build", "materials", "34"],
        value: { typeID: 34, quantity: 100 },
      },
    ]);
  });

  it("orders entries as they were made", () => {
    const state = change(
      change(holding(), "job-1", "first", (job) => {
        job.name = "One";
      }),
      "job-1",
      "second",
      (job) => {
        job.name = "Two";
      },
    );

    expect(state.log.map((entry) => entry.command)).toEqual([
      "first",
      "second",
    ]);
    expect(state.log[0].seq).toBeLessThan(state.log[1].seq);
  });
});

describe("a job the editor is not holding", () => {
  it("cannot be changed", () => {
    const state = holding();

    expect(change(state, "job-2", "rename", () => {})).toBe(state);
    expect(committedFor(state, "job-2")).toBeUndefined();
  });
});

// Undo reads the log backwards a step at a time, where a step is what the
// player did rather than a path that moved.
describe("taking a step back", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const renamed = () =>
    change(holding(), "job-1", "rename", (job) => {
      job.name = "Renamed";
    });

  it("restores what the step changed", () => {
    expect(draftFor(undo(renamed()), "job-1").name).toBe("Job");
  });

  it("puts back everything one command touched, not a part of it", () => {
    const state = change(holding(), "job-1", "import purchase", (job) => {
      job.build.materials[34].quantity = 0;
      job.build.materials[34].purchasing = { "buy-1": { quantity: 100 } };
    });

    expect(draftFor(undo(state), "job-1").build.materials[34]).toEqual({
      typeID: 34,
      quantity: 100,
    });
  });

  it("leaves the steps before it alone", () => {
    const state = change(renamed(), "job-1", "set run count", (job) => {
      job.build.setup["setup-1"].runCount = 40;
    });
    const draft = draftFor(undo(state), "job-1");

    expect(draft.name).toBe("Renamed");
    expect(draft.build.setup["setup-1"].runCount).toBe(10);
  });

  it("stops counting as a change to save", () => {
    expect(hasChanges(undo(renamed()), "job-1")).toBe(false);
  });

  it("names the step, for the copy on the control", () => {
    expect(nextUndo(renamed()).command).toBe("rename");
    expect(nextUndo(holding())).toBeUndefined();
  });

  it("does nothing when there is nothing to take back", () => {
    const state = holding();

    expect(undo(state)).toBe(state);
  });

  // A question is undoable the same way a change is, and the newest step is the
  // newest whichever layer it landed in.
  it("takes back a question before the change under it", () => {
    const state = ask(renamed(), "job-1", "try a run count", (job) => {
      job.build.setup["setup-1"].runCount = 99;
    });
    const back = undo(state);

    expect(back.scratch).toEqual([]);
    expect(draftFor(back, "job-1").name).toBe("Renamed");
  });

  // The base moves under the editor whenever a co-member saves, so a step taken
  // back must leave the arrived document standing rather than the job as it was
  // when the step was made.
  it("keeps a document that arrived while the step stood", () => {
    const arrived = setBase(
      renamed(),
      "job-1",
      document({ jobStatus: 2, name: "Named by somebody else" }),
    );
    const draft = draftFor(undo(arrived), "job-1");

    expect(draft.name).toBe("Named by somebody else");
    expect(draft.jobStatus).toBe(2);
  });
});

describe("putting a step back", () => {
  const renamed = () =>
    change(holding(), "job-1", "rename", (job) => {
      job.name = "Renamed";
    });

  it("returns the step undo took", () => {
    expect(draftFor(redo(undo(renamed())), "job-1").name).toBe("Renamed");
    expect(hasChanges(redo(undo(renamed())), "job-1")).toBe(true);
  });

  it("returns a question to the layer it came from", () => {
    const asked = ask(holding(), "job-1", "try a run count", (job) => {
      job.build.setup["setup-1"].runCount = 99;
    });
    const back = redo(undo(asked));

    expect(back.log).toEqual([]);
    expect(draftFor(back, "job-1").build.setup["setup-1"].runCount).toBe(99);
  });

  it("is forgotten once the player changes something else", () => {
    const state = change(undo(renamed()), "job-1", "rename", (job) => {
      job.name = "Something else";
    });

    expect(nextRedo(state)).toBeUndefined();
    expect(redo(state)).toBe(state);
  });

  it("goes with the job when the editor lets it go", () => {
    expect(forgetJob(undo(renamed()), "job-1").undone).toEqual([]);
    expect(discard(undo(renamed())).undone).toEqual([]);
  });
});

// Typing a cost into a field produces a keystroke's worth of change each time.
// Without coalescing the player would press undo twenty times to take back one
// number.
describe("a run of typing", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const typing = (values, gap = 0) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    return values.reduce((state, value) => {
      vi.advanceTimersByTime(gap);
      return change(state, "job-1", "set run count", (job) => {
        job.build.setup["setup-1"].runCount = value;
      });
    }, holding());
  };

  it("is one step, ending where the player stopped", () => {
    const state = typing([1, 12, 123], 100);

    expect(state.log).toHaveLength(1);
    expect(draftFor(state, "job-1").build.setup["setup-1"].runCount).toBe(123);
  });

  it("takes back to what the field held before the run", () => {
    const state = typing([1, 12, 123], 100);

    expect(draftFor(undo(state), "job-1").build.setup["setup-1"].runCount).toBe(
      10,
    );
  });

  it("starts a new step after a pause", () => {
    const state = typing([1, 12], TYPING_COALESCE_MS + 1);

    expect(state.log).toHaveLength(2);
    expect(draftFor(undo(state), "job-1").build.setup["setup-1"].runCount).toBe(
      1,
    );
  });

  it("does not merge into a different command", () => {
    vi.useFakeTimers();
    const state = change(
      change(holding(), "job-1", "set run count", (job) => {
        job.build.setup["setup-1"].runCount = 40;
      }),
      "job-1",
      "rename",
      (job) => {
        job.name = "Renamed";
      },
    );

    expect(state.log).toHaveLength(2);
  });

  // Only replaces merge, because that is the pair whose inverse is provably
  // still right: the older before-image describes a field the newer patch only
  // overwrites. A step that puts a field there in the first place is left as its
  // own step rather than reasoned about.
  it("does not merge a step that adds a field", () => {
    vi.useFakeTimers();
    const state = change(
      change(holding(), "job-1", "set a note", (job) => {
        job.note = "One";
      }),
      "job-1",
      "set a note",
      (job) => {
        job.note = "Two";
      },
    );

    expect(state.log).toHaveLength(2);
    expect(draftFor(undo(state), "job-1").note).toBe("One");
  });

  it("does not merge across a step made in between", () => {
    vi.useFakeTimers();
    const first = change(holding(), "job-1", "set run count", (job) => {
      job.build.setup["setup-1"].runCount = 40;
    });
    const asked = ask(first, "job-1", "try a name", (job) => {
      job.name = "What if";
    });
    const state = change(asked, "job-1", "set run count", (job) => {
      job.build.setup["setup-1"].runCount = 50;
    });

    expect(state.log).toHaveLength(2);
  });
});

// Keeping a question moves it into the log, where it is replayed alongside the
// changes — so where it sits in that order is the whole of whether a change made
// after it survives.
describe("keeping a question the player asked", () => {
  const asked = () =>
    ask(holding(), "job-1", "look at planning", (job) => {
      job.jobStatus = 0;
    });

  const askedThenChanged = () =>
    change(asked(), "job-1", "move to building", (job) => {
      job.jobStatus = 2;
    });

  it("does not undo a change made after it was asked", () => {
    const state = keepAsked(askedThenChanged(), 1);

    expect(committedFor(state, "job-1").jobStatus).toBe(2);
    expect(draftFor(state, "job-1").jobStatus).toBe(2);
  });

  it("is taken back in the order it was asked", () => {
    const state = keepAsked(askedThenChanged(), 1);

    expect(nextUndo(state).command).toBe("move to building");
    expect(committedFor(undo(state), "job-1").jobStatus).toBe(0);
  });

  it("does not stop the newest step coalescing with what follows it", () => {
    vi.useFakeTimers();
    const kept = keepAsked(askedThenChanged(), 1);
    const state = change(kept, "job-1", "move to building", (job) => {
      job.jobStatus = 3;
    });
    vi.useRealTimers();

    expect(state.log).toHaveLength(2);
    expect(committedFor(state, "job-1").jobStatus).toBe(3);
  });
});

import { applyPatches } from "immer";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ask,
  change,
  changedJobIDs,
  committedFor,
  discard,
  draftFor,
  entriesFor,
  emptyDraftState,
  dropHeld,
  forgetJob,
  hasChanges,
  heldFor,
  keepAsked,
  keepHeld,
  leaveScratch,
  nextRedo,
  nextUndo,
  redo,
  reviewOf,
  setBase,
  settleReview,
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

describe("reading the same state twice", () => {
  it("answers with the same job both times", () => {
    const state = change(holding(), "job-1", "set run count", (job) => {
      job.build.setup["setup-1"].runCount = 40;
    });

    expect(draftFor(state, "job-1")).toBe(draftFor(state, "job-1"));
  });
});

describe("the draft a writer leaves behind", () => {
  const replayed = (state, jobID) =>
    [
      ...state.log.filter((entry) => entry.jobID === jobID),
      ...state.scratch.filter((entry) => entry.jobID === jobID),
    ].reduce(
      (applied, entry) => applyPatches(applied, entry.patches),
      state.base[jobID],
    );

  const bothJobs = () =>
    setBase(holding(), "job-2", document({ jobID: "job-2" }));
  const rename = (state, jobID = "job-1") =>
    change(state, jobID, "rename", (job) => {
      job.name = `${job.name} renamed`;
    });
  const question = (state) =>
    ask(state, "job-1", "look at planning", (job) => {
      job.jobStatus = 0;
    });

  const writers = {
    setBase: () => setBase(rename(holding()), "job-1", document({ esi: {} })),
    forgetJob: () =>
      forgetJob(rename(rename(bothJobs(), "job-2"), "job-1"), "job-2"),
    change: () => rename(holding()),
    ask: () => question(holding()),
    "a coalesced change": () => rename(rename(holding())),
    discard: () => discard(question(rename(holding())), "job-1"),
    "discard, every job": () => discard(question(rename(holding()))),
    leaveScratch: () => leaveScratch(question(rename(holding())), "job-1"),
    "leaveScratch, every job": () => leaveScratch(question(rename(holding()))),
    keepAsked: () => {
      const state = question(holding());
      return keepAsked(state, state.scratch[0].seq);
    },
    undo: () => undo(question(rename(holding()))),
    redo: () => redo(undo(question(rename(holding())))),
  };

  for (const [name, produce] of Object.entries(writers)) {
    it(`is the layers as ${name} left them`, () => {
      const state = produce();

      for (const jobID of Object.keys(state.base)) {
        expect(draftFor(state, jobID)).toEqual(replayed(state, jobID));
      }
    });
  }

  it("knows nothing about a job it has been told to forget", () => {
    const state = forgetJob(rename(holding()), "job-1");

    expect(draftFor(state, "job-1")).toBeUndefined();
  });
});

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

  it("takes back a question before the change under it", () => {
    const state = ask(renamed(), "job-1", "try a run count", (job) => {
      job.build.setup["setup-1"].runCount = 99;
    });
    const back = undo(state);

    expect(back.scratch).toEqual([]);
    expect(draftFor(back, "job-1").name).toBe("Renamed");
  });

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

describe("a document arriving under the reader's changes", () => {
  const renamed = (state) =>
    change(state, "job-1", "rename", (job) => {
      job.name = "mine";
    });
  const runsSet = (state) =>
    change(state, "job-1", "set run count", (job) => {
      job.build.setup["setup-1"].runCount = 40;
    });

  it("keeps a change nobody else touched, over what arrived", () => {
    const state = setBase(
      renamed(holding()),
      "job-1",
      document({ jobStatus: 2 }),
    );

    expect(draftFor(state, "job-1")).toMatchObject({
      name: "mine",
      jobStatus: 2,
    });
    expect(heldFor(state, "job-1")).toEqual([]);
  });

  it("drops a change the arriving document already holds", () => {
    const state = setBase(
      renamed(holding()),
      "job-1",
      document({ name: "mine" }),
    );

    expect(hasChanges(state, "job-1")).toBe(false);
    expect(heldFor(state, "job-1")).toEqual([]);
  });

  it("sets aside a change the arriving document set differently, still showing the reader's", () => {
    const state = setBase(
      renamed(holding()),
      "job-1",
      document({ name: "theirs" }),
    );

    expect(draftFor(state, "job-1").name).toBe("mine");
    expect(committedFor(state, "job-1").name).toBe("theirs");
    expect(hasChanges(state, "job-1")).toBe(false);
    expect(heldFor(state, "job-1")).toEqual([
      expect.objectContaining({
        command: "rename",
        outcome: "conflict",
        changes: [{ path: ["name"], mine: "mine" }],
      }),
    ]);
  });

  it("sets aside a change to something that is gone, still showing it as the reader had it", () => {
    const state = setBase(
      runsSet(holding()),
      "job-1",
      document({ build: { setup: {}, materials: {} } }),
    );

    expect(draftFor(state, "job-1").build.setup).toEqual({
      "setup-1": { id: "setup-1", runCount: 40 },
    });
    expect(committedFor(state, "job-1").build.setup).toEqual({});
    expect(heldFor(state, "job-1")).toEqual([
      expect.objectContaining({ command: "set run count", outcome: "gone" }),
    ]);
  });

  it("puts a kept conflict back over what arrived", () => {
    const arrived = setBase(
      renamed(holding()),
      "job-1",
      document({ name: "theirs" }),
    );
    const [held] = heldFor(arrived, "job-1");

    const state = keepHeld(arrived, held.seq);

    expect(draftFor(state, "job-1").name).toBe("mine");
    expect(hasChanges(state, "job-1")).toBe(true);
    expect(heldFor(state, "job-1")).toEqual([]);
    expect(Object.keys(state.log[0]).sort()).toEqual([
      "at",
      "command",
      "inversePatches",
      "jobID",
      "patches",
      "seq",
    ]);
  });

  it("will not keep a change to something that is gone", () => {
    const arrived = setBase(
      runsSet(holding()),
      "job-1",
      document({ build: { setup: {}, materials: {} } }),
    );
    const [held] = heldFor(arrived, "job-1");

    expect(keepHeld(arrived, held.seq)).toBe(arrived);
  });

  it("lets a dropped change go and leaves the document as it arrived", () => {
    const arrived = setBase(
      renamed(holding()),
      "job-1",
      document({ name: "theirs" }),
    );
    const [held] = heldFor(arrived, "job-1");

    const state = dropHeld(arrived, held.seq);

    expect(heldFor(state, "job-1")).toEqual([]);
    expect(draftFor(state, "job-1").name).toBe("theirs");
  });

  it("drops a question that no longer applies and keeps the rest", () => {
    const asked = ask(holding(), "job-1", "try more runs", (job) => {
      job.build.setup["setup-1"].runCount = 99;
    });

    const state = setBase(
      asked,
      "job-1",
      document({ build: { setup: {}, materials: {} } }),
    );

    expect(state.scratch).toEqual([]);
    expect(draftFor(state, "job-1").build.setup).toEqual({});
  });

  it("leaves the reader's changes alone when the same document arrives again", () => {
    const changed = renamed(holding());

    const state = setBase(changed, "job-1", document());

    expect(state.log).toBe(changed.log);
    expect(nextRedo(state)).toBe(nextRedo(changed));
  });

  it("drops a held change with the one it builds on, whichever is named", () => {
    const added = change(holding(), "job-1", "add setup", (job) => {
      job.build.setup["setup-2"] = { id: "setup-2", runCount: 1 };
    });
    const edited = change(added, "job-1", "set its runs", (job) => {
      job.build.setup["setup-2"].runCount = 5;
    });
    const arrived = setBase(
      edited,
      "job-1",
      document({
        build: {
          setup: { "setup-2": { id: "setup-2", runCount: 3 } },
          materials: {},
        },
      }),
    );
    const follower = heldFor(arrived, "job-1").find((entry) => entry.follows);

    expect(heldFor(dropHeld(arrived, follower.seq), "job-1")).toEqual([]);
  });

  it("forgets what undo took back once a different copy arrives", () => {
    const undoneOnce = undo(renamed(holding()));

    const state = setBase(undoneOnce, "job-1", document({ jobStatus: 2 }));

    expect(nextRedo(undoneOnce)).toBeDefined();
    expect(nextRedo(state)).toBeUndefined();
  });

  it("lets a held change go on undo and brings it back on redo", () => {
    const arrived = setBase(
      renamed(holding()),
      "job-1",
      document({ name: "theirs" }),
    );

    const undone = undo(arrived);
    expect(draftFor(undone, "job-1").name).toBe("theirs");
    expect(heldFor(undone, "job-1")).toEqual([]);

    const redone = redo(undone);
    expect(draftFor(redone, "job-1").name).toBe("mine");
    expect(heldFor(redone, "job-1")).toHaveLength(1);
  });

  it("drops what is held when the reader discards", () => {
    const arrived = setBase(
      renamed(holding()),
      "job-1",
      document({ name: "theirs" }),
    );

    expect(heldFor(discard(arrived), "job-1")).toEqual([]);
    expect(heldFor(discard(arrived, "job-1"), "job-1")).toEqual([]);
    expect(heldFor(forgetJob(arrived, "job-1"), "job-1")).toEqual([]);
  });
});

describe("what the reader is asked to review", () => {
  const made = () => {
    let state = holding();
    state = change(state, "job-1", "rename", (job) => {
      job.name = "mine";
    });
    state = change(state, "job-1", "set run count", (job) => {
      job.build.setup["setup-1"].runCount = 40;
    });
    state = change(state, "job-1", "set status", (job) => {
      job.jobStatus = 2;
    });
    return change(state, "job-1", "drop tritanium", (job) => {
      delete job.build.materials[34];
    });
  };
  const arrived = () =>
    setBase(
      made(),
      "job-1",
      document({
        name: "theirs",
        build: { setup: {}, materials: {} },
      }),
    );

  it("groups each change by how it stands", () => {
    const review = reviewOf(arrived(), "job-1");

    expect(review.choose).toEqual([
      {
        seq: 1,
        command: "rename",
        follows: [],
        values: [{ mine: "mine", incoming: "theirs" }],
      },
    ]);
    expect(review.gone).toEqual([{ seq: 2, command: "set run count" }]);
    expect(review.applies).toEqual([{ seq: 3, command: "set status" }]);
    expect(review.saved).toEqual([{ seq: 4, command: "drop tritanium" }]);
  });

  it("keeps the conflicts the reader keeps and lets the rest go", () => {
    const state = settleReview(arrived(), "job-1", { keep: [1], letGo: [3] });

    expect(draftFor(state, "job-1")).toMatchObject({
      name: "mine",
      jobStatus: 1,
    });
    expect(draftFor(state, "job-1").build.setup).toEqual({});
    expect(entriesFor(state, "job-1").map((entry) => entry.command)).toEqual([
      "rename",
    ]);
    expect(reviewOf(state, "job-1")).toEqual({
      choose: [],
      gone: [],
      applies: [{ seq: 1, command: "rename" }],
      saved: [],
    });
  });

  it("takes the incoming save for every conflict the reader does not keep", () => {
    const state = settleReview(arrived(), "job-1", { keep: [], letGo: [] });

    expect(draftFor(state, "job-1").name).toBe("theirs");
    expect(heldFor(state, "job-1")).toEqual([]);
  });
});

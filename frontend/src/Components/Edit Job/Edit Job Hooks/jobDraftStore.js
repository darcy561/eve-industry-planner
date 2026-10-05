import { applyPatches, enablePatches, freeze, produceWithPatches } from "immer";
import { sameValue } from "../../../Functions/Helper/documentValues.js";
import { readAt, restoreOver, reviewChanges } from "./jobDraftReview.js";

enablePatches();

/**
 * @typedef {object} DraftEntry
 * @property {number} seq - Where this entry sits in the order it was made
 * @property {string} command - What the player did, named for undo copy
 * @property {string} jobID - The job this entry changed
 * @property {Array<object>} patches - What it changed
 * @property {Array<object>} inversePatches - What it takes to put it back
 * @property {number} at - When it was recorded, for coalescing a run of typing
 */

/**
 * @typedef {object} DraftState
 * @property {Object<string, object>} base - Job id to the document as loaded or
 *     last received. Never written to by an edit.
 * @property {Array<DraftEntry>} log - What the player changed, oldest first
 * @property {Array<DraftEntry>} scratch - What the player asked about
 * @property {Array<HeldEntry>} held - Changes a new copy of the job set aside for the player to
 *     keep or drop, still shown in the draft but kept out of the save until they do
 * @property {Array<{seq: number, command: string, jobID: string}>} settled - The player's changes a
 *     new copy already held, kept only to tell them so
 * @property {Array<UndoneEntry>} undone - What undo took off, newest last
 * @property {number} nextSeq - The sequence the next entry takes
 * @property {Object<string, object>} drafts - Job id to the job as it reads now.
 *     Derived from the layers and rebuilt whenever they move, rather than worked
 *     out by whoever asks
 */

/**
 * @typedef {DraftEntry & {layer: "log"|"scratch"|"held"}} UndoneEntry - An entry undo
 *     removed, carrying the layer it goes back to
 */

/**
 * @typedef {DraftEntry & import("./jobDraftReview.js").ReviewedChange} HeldEntry - A change that
 *     conflicts with, or names something gone from, the copy that arrived under it
 */

/**
 * @returns {DraftState} An editor holding nothing
 */
export function emptyDraftState() {
  return {
    base: {},
    log: [],
    scratch: [],
    held: [],
    settled: [],
    undone: [],
    nextSeq: 1,
    drafts: {},
  };
}

/**
 * The layers replayed for one job: base, then what was changed, then the reader's version of what
 * was set aside, then what was asked.
 *
 * @param {DraftState} state
 * @param {string} jobID
 * @returns {object|undefined}
 */
function replay(state, jobID) {
  const base = state.base[jobID];
  if (!base) return undefined;

  const changed = state.log
    .filter((entry) => entry.jobID === jobID)
    .reduce((applied, entry) => applyPatches(applied, entry.patches), base);
  const kept = heldFor(state, jobID).reduce(
    (applied, entry) => restoreOver(applied, entry.restore),
    changed,
  );
  return state.scratch
    .filter((entry) => entry.jobID === jobID)
    .reduce((applied, entry) => applyPatches(applied, entry.patches), kept);
}

/**
 * The state with every held job's draft rebuilt, which is how every function here returns one.
 *
 * @param {DraftState} state
 * @returns {DraftState}
 */
function withDrafts(state) {
  const drafts = {};
  for (const jobID of Object.keys(state.base)) {
    drafts[jobID] = replay(state, jobID);
  }
  return { ...state, drafts };
}

/**
 * Seeds a job's base, or replaces it when the document is delivered again, keeping the reader's
 * changes that still apply and setting aside the ones that do not.
 *
 * @param {DraftState} state
 * @param {string} jobID
 * @param {object} document - The job as plain data, not a class instance
 * @returns {DraftState}
 */
export function setBase(state, jobID, document) {
  const before = state.base[jobID];
  const after = freeze(document, true);
  const base = { ...state.base, [jobID]: after };
  if (!before || sameValue(before, after)) {
    return withDrafts({ ...state, base });
  }

  const reviewed = reviewChanges(before, after, entriesFor(state, jobID));
  const kept = new Set(
    reviewed
      .filter((change) => change.outcome === "clean")
      .map((change) => change.entry.seq),
  );
  const held = reviewed
    .filter(
      (change) => change.outcome === "conflict" || change.outcome === "gone",
    )
    .map(({ entry, ...review }) => ({ ...entry, ...review }));

  const log = state.log.filter(
    (entry) => entry.jobID !== jobID || kept.has(entry.seq),
  );
  const committed = log
    .filter((entry) => entry.jobID === jobID)
    .reduce((applied, entry) => applyPatches(applied, entry.patches), after);

  return withDrafts({
    ...state,
    base,
    log,
    scratch: stillApplying(
      state.scratch,
      jobID,
      [...state.held, ...held]
        .filter((entry) => entry.jobID === jobID)
        .reduce(
          (applied, entry) => restoreOver(applied, entry.restore),
          committed,
        ),
    ),
    held: [...state.held, ...held],
    settled: [
      ...state.settled,
      ...reviewed
        .filter((change) => change.outcome === "done")
        .map(({ entry: { seq, command } }) => ({ seq, command, jobID })),
    ],
    undone: state.undone.filter((entry) => entry.jobID !== jobID),
  });
}

/**
 * The player's changes to this job that a new copy already held, oldest first.
 *
 * @param {DraftState} state
 * @param {string} jobID
 * @returns {Array<{seq: number, command: string, jobID: string}>}
 */
export function settledFor(state, jobID) {
  return state.settled.filter((entry) => entry.jobID === jobID);
}

/**
 * @typedef {object} ChangeReview
 * @property {Array<{seq: number, command: string, follows: Array<string>, values: Array<{mine: *, incoming: *}>}>} choose
 *     Conflicts, each with the changes that depend on it and both values at each place it set
 * @property {Array<{seq: number, command: string}>} gone - Changes to something the copy removed
 * @property {Array<{seq: number, command: string}>} applies - Changes that still apply
 * @property {Array<{seq: number, command: string}>} saved - Changes the copy already held
 */

/**
 * What the player is asked to review for one job, grouped by how each of their changes stands.
 *
 * @param {DraftState} state
 * @param {string} jobID
 * @returns {ChangeReview}
 */
export function reviewOf(state, jobID) {
  const held = heldFor(state, jobID);
  const leaders = held.filter((entry) => entry.follows === undefined);
  const incoming = committedFor(state, jobID);
  const followersOf = (seq) =>
    held.filter((entry) => entry.follows === seq).map((entry) => entry.command);
  const named = ({ seq, command }) => ({ seq, command });

  return {
    choose: leaders
      .filter((entry) => entry.outcome === "conflict")
      .map((entry) => ({
        ...named(entry),
        follows: followersOf(entry.seq),
        values: entry.changes.map(({ path, mine }) => ({
          mine,
          incoming: readAt(incoming, path),
        })),
      })),
    gone: leaders.filter((entry) => entry.outcome === "gone").map(named),
    applies: entriesFor(state, jobID).map(named),
    saved: settledFor(state, jobID).map(named),
  };
}

/**
 * Applies the player's review of a job: the held changes named in `keep` go back over the new copy,
 * every other held change goes, and the changes named in `letGo` leave the log.
 *
 * @param {DraftState} state
 * @param {string} jobID
 * @param {{keep: Array<number>, letGo: Array<number>}} choices - Held changes by their leading seq,
 *     log changes by their own
 * @returns {DraftState}
 */
export function settleReview(state, jobID, { keep, letGo }) {
  const kept = keep.reduce((held, seq) => keepHeld(held, seq), state);
  const going = new Set(letGo);
  return withDrafts({
    ...kept,
    log: kept.log.filter(
      (entry) => entry.jobID !== jobID || !going.has(entry.seq),
    ),
    held: kept.held.filter((entry) => entry.jobID !== jobID),
    settled: kept.settled.filter((entry) => entry.jobID !== jobID),
  });
}

/**
 * A job's entries in a layer that still apply in order on top of `document`, with the rest of the
 * layer untouched.
 *
 * @param {Array<DraftEntry>} entries
 * @param {string} jobID
 * @param {object} document
 * @returns {Array<DraftEntry>}
 */
function stillApplying(entries, jobID, document) {
  let applied = document;
  return entries.filter((entry) => {
    if (entry.jobID !== jobID) return true;
    try {
      applied = applyPatches(applied, entry.patches);
      return true;
    } catch {
      return false;
    }
  });
}

/**
 * The changes a new copy of this job set aside, oldest first.
 *
 * @param {DraftState} state
 * @param {string} jobID
 * @returns {Array<HeldEntry>}
 */
export function heldFor(state, jobID) {
  return state.held.filter((entry) => entry.jobID === jobID);
}

/**
 * A held change, the one it depends on and the others depending on that, which are kept or dropped
 * together.
 *
 * @param {DraftState} state
 * @param {number} seq
 * @returns {Array<HeldEntry>}
 */
function heldGroup(state, seq) {
  const leader = state.held.find((entry) => entry.seq === seq)?.follows ?? seq;
  return state.held.filter(
    (entry) => entry.seq === leader || entry.follows === leader,
  );
}

/**
 * Puts a conflicting change back into the log over the job as it now stands, with the changes that
 * depend on it; one naming something gone cannot be kept.
 *
 * @param {DraftState} state
 * @param {number} seq
 * @returns {DraftState} Unchanged when the change is not held, is gone, or no longer applies
 */
export function keepHeld(state, seq) {
  const group = heldGroup(state, seq);
  if (group.length === 0 || group.some((entry) => entry.outcome === "gone")) {
    return state;
  }
  const { jobID } = group[0];
  const restored = group.map(
    ({ outcome, follows, changes, restore, ...entry }) => entry,
  );
  try {
    restored.reduce(
      (applied, entry) => applyPatches(applied, entry.patches),
      committedFor(state, jobID),
    );
  } catch {
    return state;
  }

  const seqs = new Set(group.map((entry) => entry.seq));
  return withDrafts({
    ...state,
    log: [...state.log, ...restored].sort((a, b) => a.seq - b.seq),
    held: state.held.filter((entry) => !seqs.has(entry.seq)),
  });
}

/**
 * Lets a held change go, with the changes that depend on it, so the job reads as the new copy has
 * it.
 *
 * @param {DraftState} state
 * @param {number} seq
 * @returns {DraftState}
 */
export function dropHeld(state, seq) {
  const seqs = new Set(heldGroup(state, seq).map((entry) => entry.seq));
  if (seqs.size === 0) return state;
  return withDrafts({
    ...state,
    held: state.held.filter((entry) => !seqs.has(entry.seq)),
  });
}

/**
 * @param {DraftState} state @param {string} jobID @returns {DraftState}
 */
export function forgetJob(state, jobID) {
  const base = { ...state.base };
  delete base[jobID];
  return withDrafts({
    ...state,
    base,
    log: state.log.filter((entry) => entry.jobID !== jobID),
    scratch: state.scratch.filter((entry) => entry.jobID !== jobID),
    held: state.held.filter((entry) => entry.jobID !== jobID),
    settled: state.settled.filter((entry) => entry.jobID !== jobID),
    undone: state.undone.filter((entry) => entry.jobID !== jobID),
  });
}

/** How long a run of typing keeps merging into one undo step. */
export const TYPING_COALESCE_MS = 800;

function coalesces(previous, entry, nextSeq) {
  if (!previous) return false;
  if (previous.seq !== nextSeq - 1) return false;
  if (previous.jobID !== entry.jobID) return false;
  if (previous.command !== entry.command) return false;
  if (entry.at - previous.at > TYPING_COALESCE_MS) return false;

  const paths = (patches) =>
    patches.map((patch) => patch.path.join("\u0000")).join("|");
  const replacesOnly = (patches) =>
    patches.every((patch) => patch.op === "replace");

  return (
    replacesOnly(previous.patches) &&
    replacesOnly(entry.patches) &&
    paths(previous.patches) === paths(entry.patches)
  );
}

function record(state, layer, jobID, command, recipe) {
  const held = state.base[jobID];
  if (!held) return state;

  const from =
    layer === "scratch" ? draftFor(state, jobID) : committedFor(state, jobID);
  const [, patches, inversePatches] = produceWithPatches(from, recipe);
  if (patches.length === 0) return state;

  const entry = {
    seq: state.nextSeq,
    command,
    jobID,
    patches,
    inversePatches,
    at: Date.now(),
  };

  const entries = state[layer];
  const previous = entries.reduce(
    (newest, candidate) =>
      !newest || candidate.seq > newest.seq ? candidate : newest,
    undefined,
  );
  if (coalesces(previous, entry, state.nextSeq)) {
    const merged = {
      ...entry,
      seq: previous.seq,
      inversePatches: previous.inversePatches,
    };
    return withDrafts({
      ...state,
      [layer]: entries.map((held) => (held.seq === merged.seq ? merged : held)),
      undone: [],
    });
  }

  return withDrafts({
    ...state,
    [layer]: [...entries, entry],
    undone: [],
    nextSeq: state.nextSeq + 1,
  });
}

/**
 * Records a change the player means to keep, handing the recipe the job as it would save rather
 * than as it reads on screen.
 *
 * @param {DraftState} state
 * @param {string} jobID
 * @param {string} command - Names the step for undo, e.g. "set run count"
 * @param {(draft: object) => void} recipe - Changes the job in place
 * @returns {DraftState} Unchanged when the recipe changed nothing
 */
export function change(state, jobID, command, recipe) {
  return record(state, "log", jobID, command, recipe);
}

/**
 * Records a question the player asked, which never reaches a save.
 *
 * @param {DraftState} state
 * @param {string} jobID
 * @param {string} command
 * @param {(draft: object) => void} recipe
 * @returns {DraftState}
 */
export function ask(state, jobID, command, recipe) {
  return record(state, "scratch", jobID, command, recipe);
}

/**
 * The job as it reads now, and the same object for as long as the layers under it hold, so a reader
 * may compare it by identity.
 *
 * @param {DraftState} state
 * @param {string} jobID
 * @returns {object|undefined} Plain data, or undefined for a job not held
 */
export function draftFor(state, jobID) {
  return state.drafts[jobID];
}

/**
 * What a save sends: the base with the changes applied and the questions left out.
 *
 * @param {DraftState} state
 * @param {string} jobID
 * @returns {object|undefined}
 */
export function committedFor(state, jobID) {
  const held = state.base[jobID];
  if (!held) return undefined;

  return state.log
    .filter((entry) => entry.jobID === jobID)
    .reduce((document, entry) => applyPatches(document, entry.patches), held);
}

/**
 * Whether there is anything to save.
 *
 * @param {DraftState} state
 * @param {string} [jobID] - Any job when omitted
 * @returns {boolean}
 */
export function hasChanges(state, jobID) {
  if (jobID === undefined) return state.log.length > 0;
  return state.log.some((entry) => entry.jobID === jobID);
}

/**
 * What the reader changed to this job, oldest first, and what a field-scoped write is built from.
 *
 * @param {DraftState} state
 * @param {string} jobID
 * @returns {Array<DraftEntry>}
 */
export function entriesFor(state, jobID) {
  return state.log.filter((entry) => entry.jobID === jobID);
}

/**
 * @param {DraftState} state @returns {Array<string>} Jobs the log changed
 */
export function changedJobIDs(state) {
  return [...new Set(state.log.map((entry) => entry.jobID))];
}

/**
 * Drops what the player changed, leaving them on the document as it now stands, which is what
 * closing without saving does.
 *
 * @param {DraftState} state
 * @param {string} [jobID] - Every job when omitted
 * @returns {DraftState}
 */
export function discard(state, jobID) {
  if (jobID === undefined)
    return withDrafts({
      ...state,
      log: [],
      scratch: [],
      held: [],
      settled: [],
      undone: [],
    });
  return withDrafts({
    ...state,
    log: state.log.filter((entry) => entry.jobID !== jobID),
    scratch: state.scratch.filter((entry) => entry.jobID !== jobID),
    held: state.held.filter((entry) => entry.jobID !== jobID),
    settled: state.settled.filter((entry) => entry.jobID !== jobID),
    undone: state.undone.filter((entry) => entry.jobID !== jobID),
  });
}

/**
 * Drops what the player asked about, leaving what they changed.
 *
 * @param {DraftState} state
 * @param {string} [jobID]
 * @returns {DraftState}
 */
export function leaveScratch(state, jobID) {
  const asked = (entry) => entry.layer === "scratch";
  if (jobID === undefined)
    return withDrafts({
      ...state,
      scratch: [],
      undone: state.undone.filter((entry) => !asked(entry)),
    });
  return withDrafts({
    ...state,
    scratch: state.scratch.filter((entry) => entry.jobID !== jobID),
    undone: state.undone.filter(
      (entry) => !asked(entry) || entry.jobID !== jobID,
    ),
  });
}

/**
 * Moves a question into the changes, keeping its patches and before-image so it stays undoable the
 * same way.
 *
 * @param {DraftState} state
 * @param {number} seq
 * @returns {DraftState}
 */
export function keepAsked(state, seq) {
  const entry = state.scratch.find((held) => held.seq === seq);
  if (!entry) return state;

  const at = state.log.findIndex((held) => held.seq > seq);
  const log =
    at === -1
      ? [...state.log, entry]
      : [...state.log.slice(0, at), entry, ...state.log.slice(at)];

  return withDrafts({
    ...state,
    log,
    scratch: state.scratch.filter((held) => held.seq !== seq),
  });
}

/**
 * @param {DraftState} state @returns {UndoneEntry|undefined}
 */
function newestStep(state) {
  const steps = [
    ...state.log.map((entry) => ({ ...entry, layer: "log" })),
    ...state.scratch.map((entry) => ({ ...entry, layer: "scratch" })),
    ...state.held.map((entry) => ({ ...entry, layer: "held" })),
  ];
  return steps.reduce(
    (newest, entry) => (!newest || entry.seq > newest.seq ? entry : newest),
    undefined,
  );
}

/**
 * The step undo would take back, for the copy on the control: *Undo: link market order*.
 *
 * @param {DraftState} state
 * @returns {UndoneEntry|undefined} Nothing when there is nothing to take back
 */
export function nextUndo(state) {
  return newestStep(state);
}

/**
 * @param {DraftState} state @returns {UndoneEntry|undefined}
 */
export function nextRedo(state) {
  return state.undone[state.undone.length - 1];
}

/**
 * Takes back the newest step, whichever layer it landed in, by dropping it rather than replaying it
 * backwards.
 *
 * @param {DraftState} state
 * @returns {DraftState} Unchanged when there is nothing to take back
 */
export function undo(state) {
  const step = newestStep(state);
  if (!step) return state;

  return withDrafts({
    ...state,
    [step.layer]: state[step.layer].filter((entry) => entry.seq !== step.seq),
    undone: [...state.undone, step],
  });
}

/**
 * Puts back the step undo last took, into the layer it came from, until the player changes
 * something else.
 *
 * @param {DraftState} state
 * @returns {DraftState}
 */
export function redo(state) {
  const step = nextRedo(state);
  if (!step) return state;

  const { layer, ...entry } = step;
  return withDrafts({
    ...state,
    [layer]: [...state[layer], entry],
    undone: state.undone.slice(0, -1),
  });
}

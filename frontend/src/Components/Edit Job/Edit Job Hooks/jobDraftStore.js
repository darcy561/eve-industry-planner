import { applyPatches, enablePatches, freeze, produceWithPatches } from "immer";

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
 *   last received. Never written to by an edit.
 * @property {Array<DraftEntry>} log - What the player changed, oldest first
 * @property {Array<DraftEntry>} scratch - What the player asked about
 * @property {Array<UndoneEntry>} undone - What undo took off, newest last
 * @property {number} nextSeq - The sequence the next entry takes
 * @property {Object<string, object>} drafts - Job id to the job as it reads now.
 *   Derived from the layers and rebuilt whenever they move, rather than worked
 *   out by whoever asks
 */

/**
 * @typedef {DraftEntry & {layer: "log"|"scratch"}} UndoneEntry - An entry undo
 *   removed, carrying the layer it goes back to
 */

/**
 * The three layers a job is held in while it is open, and the draft derived from
 * them. An edit is recorded as what it changed rather than as a rebuilt job, so
 * the before-image survives it and the layer it landed in decides what it means.
 *
 * `log` is what the player changed and is what a save reads. `scratch` is what
 * they asked about — it changes what is on screen and is never collected, so an
 * experiment does not mark the job as having unsaved changes. `base` is the
 * document as the server last stated it, and it is replaced rather than edited:
 * a change arriving while the editor is open lands underneath both layers, and
 * they re-apply over it.
 *
 * The base holds a map rather than one document because an edit session is not
 * one job — linking a child writes the child's parents, and close time
 * recalculates the tree — so every entry names the job it changed.
 *
 * The draft each job reads as is a **field**, rebuilt by every function here that
 * returns a changed state. Worked out on demand instead, it would be a new object
 * on every read: the layers are replayed with `applyPatches`, which copies the
 * job it returns, so a panel subscribing to part of the job would be handed
 * something new every time it was asked and would never settle.
 */

/** @returns {DraftState} An editor holding nothing */
export function emptyDraftState() {
  return { base: {}, log: [], scratch: [], undone: [], nextSeq: 1, drafts: {} };
}

/**
 * The layers replayed for one job: base, then what was changed, then what was
 * asked.
 *
 * Scratch applies last so an experiment is not disturbed by a change arriving
 * underneath it — the what-if is the topmost answer to "what does this say".
 *
 * @param {DraftState} state
 * @param {string} jobID
 * @returns {object|undefined}
 */
function replay(state, jobID) {
  const held = state.base[jobID];
  if (!held) return undefined;

  const entries = [
    ...state.log.filter((entry) => entry.jobID === jobID),
    ...state.scratch.filter((entry) => entry.jobID === jobID),
  ];
  return entries.reduce(
    (applied, entry) => applyPatches(applied, entry.patches),
    held,
  );
}

/**
 * The state with every held job's draft rebuilt, which is how every function
 * here returns one.
 *
 * That is the whole of the discipline: a state that left this module without
 * coming through here would carry a draft describing layers it no longer has,
 * and a reader comparing by identity would never notice. `the draft a writer
 * leaves behind` in the tests beside this file holds each of them to it.
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
 * Seeds a job's base, or replaces it when the document is delivered again.
 *
 * Replacing rather than merging is what makes an open editor follow the
 * document: the reader's own layers sit above this one and re-apply over
 * whatever it now holds, so an inbound change costs them nothing they changed
 * themselves.
 *
 * @param {DraftState} state
 * @param {string} jobID
 * @param {object} document - The job as plain data, not a class instance
 * @returns {DraftState}
 */
export function setBase(state, jobID, document) {
  // Frozen on the way in, so the job a reader is shown cannot be written to
  // from the moment it opens. What a change produces is frozen by `produce`
  // anyway; without this the guarantee would only start at the first edit.
  return withDrafts({
    ...state,
    base: { ...state.base, [jobID]: freeze(document, true) },
  });
}

/** @param {DraftState} state @param {string} jobID @returns {DraftState} */
export function forgetJob(state, jobID) {
  const base = { ...state.base };
  delete base[jobID];
  return withDrafts({
    ...state,
    base,
    log: state.log.filter((entry) => entry.jobID !== jobID),
    scratch: state.scratch.filter((entry) => entry.jobID !== jobID),
    undone: state.undone.filter((entry) => entry.jobID !== jobID),
  });
}

/** How long a run of typing keeps merging into one undo step. */
export const TYPING_COALESCE_MS = 800;

// Only replaces over the same paths merge: the newer patches say where the
// field ends and the older inverse still says where it started. An add or a
// removal would leave a pair that no longer inverts.
function coalesces(previous, entry, nextSeq) {
  if (!previous) return false;
  // Nothing may have happened since: a step recorded in between would have to
  // be undone before this one, and merging would put it out of order.
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

  // A change is written against what the player is looking at, which for a
  // change means base plus the changes before it and *not* the questions above
  // them: a what-if is dropped when the editor closes, and an entry recorded
  // over one would carry its value into the save. A question is written against
  // the whole draft, because that is what it is asking about.
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
 * Records a change the player means to keep.
 *
 * The recipe is handed the job as it would save — the base with the changes
 * before it applied, and no questions — so a what-if on screen cannot leak a
 * value into the change. The entry stays re-appliable onto a base that has since
 * moved, because its patches name paths rather than carrying the whole job.
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
 * The job as it reads now: base, then what was changed, then what was asked.
 *
 * The same object for as long as the layers under it hold, so a reader compares
 * it by identity rather than by value — and every subtree an entry did not touch
 * is the object it was in the base, so the comparison holds part by part as well
 * as whole.
 *
 * @param {DraftState} state
 * @param {string} jobID
 * @returns {object|undefined} Plain data, or undefined for a job not held
 */
export function draftFor(state, jobID) {
  return state.drafts[jobID];
}

/**
 * What a save sends: the base with the changes applied and the questions left
 * out.
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
 * Whether there is anything to save. A question does not count, which is what
 * lets a player step a job back to look at it without arming the save prompt.
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
 * What the reader changed to this job, oldest first.
 *
 * A write is built from these rather than from a comparison of two documents,
 * so a job with no entries here had nothing recorded and its write carries the
 * whole document.
 *
 * @param {DraftState} state
 * @param {string} jobID
 * @returns {Array<DraftEntry>}
 */
export function entriesFor(state, jobID) {
  return state.log.filter((entry) => entry.jobID === jobID);
}

/** @param {DraftState} state @returns {Array<string>} Jobs the log changed */
export function changedJobIDs(state) {
  return [...new Set(state.log.map((entry) => entry.jobID))];
}

/**
 * Drops what the player changed, leaving them on the document as it now stands.
 *
 * This is what closing without saving does, and it is why nothing is written
 * back: the base already holds whatever arrived while the editor was open, so a
 * reader loses their own changes and nobody else's.
 *
 * @param {DraftState} state
 * @param {string} [jobID] - Every job when omitted
 * @returns {DraftState}
 */
export function discard(state, jobID) {
  if (jobID === undefined)
    return withDrafts({ ...state, log: [], scratch: [], undone: [] });
  return withDrafts({
    ...state,
    log: state.log.filter((entry) => entry.jobID !== jobID),
    scratch: state.scratch.filter((entry) => entry.jobID !== jobID),
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
 * Moves a question into the changes, for "actually, keep that".
 *
 * A promotion is an entry moving between layers rather than a new edit, so it
 * keeps its patches and its before-image and stays undoable the same way.
 *
 * @param {DraftState} state
 * @param {number} seq
 * @returns {DraftState}
 */
export function keepAsked(state, seq) {
  const entry = state.scratch.find((held) => held.seq === seq);
  if (!entry) return state;

  // Both layers are replayed in array order, so a promoted question takes its
  // place in the order it was asked rather than the end of the log: dropped at
  // the end it would apply over a change made after it and undo it.
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

/** @param {DraftState} state @returns {UndoneEntry|undefined} */
function newestStep(state) {
  const steps = [
    ...state.log.map((entry) => ({ ...entry, layer: "log" })),
    ...state.scratch.map((entry) => ({ ...entry, layer: "scratch" })),
  ];
  return steps.reduce(
    (newest, entry) => (!newest || entry.seq > newest.seq ? entry : newest),
    undefined,
  );
}

/**
 * The step undo would take back, for the copy on the control: *Undo: link
 * market order*. A question is a step like any other.
 *
 * @param {DraftState} state
 * @returns {UndoneEntry|undefined} Nothing when there is nothing to take back
 */
export function nextUndo(state) {
  return newestStep(state);
}

/** @param {DraftState} state @returns {UndoneEntry|undefined} */
export function nextRedo(state) {
  return state.undone[state.undone.length - 1];
}

/**
 * Takes back the newest step, whichever layer it landed in.
 *
 * The step is dropped rather than replayed backwards, so a document that
 * arrived underneath it is left standing.
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
 * Puts back the step undo last took, into the layer it came from.
 *
 * Nothing is kept to redo once the player changes something else: `record`
 * empties the stack, so the forward history cannot be rejoined to a log that
 * has since gone a different way.
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

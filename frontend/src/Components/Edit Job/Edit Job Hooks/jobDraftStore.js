import { applyPatches, enablePatches, produceWithPatches } from "immer";

enablePatches();

/**
 * @typedef {object} DraftEntry
 * @property {number} seq - Where this entry sits in the order it was made
 * @property {string} command - What the player did, named for undo copy
 * @property {string} jobID - The job this entry changed
 * @property {Array<object>} patches - What it changed
 * @property {Array<object>} inversePatches - What it takes to put it back
 */

/**
 * @typedef {object} DraftState
 * @property {Object<string, object>} base - Job id to the document as loaded or
 *   last received. Never written to by an edit.
 * @property {Array<DraftEntry>} log - What the player changed, oldest first
 * @property {Array<DraftEntry>} scratch - What the player asked about
 * @property {number} nextSeq - The sequence the next entry takes
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
 */

/** @returns {DraftState} An editor holding nothing */
export function emptyDraftState() {
  return { base: {}, log: [], scratch: [], nextSeq: 1 };
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
  return { ...state, base: { ...state.base, [jobID]: document } };
}

/** @param {DraftState} state @param {string} jobID @returns {DraftState} */
export function forgetJob(state, jobID) {
  const base = { ...state.base };
  delete base[jobID];
  return {
    ...state,
    base,
    log: state.log.filter((entry) => entry.jobID !== jobID),
    scratch: state.scratch.filter((entry) => entry.jobID !== jobID),
  };
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
  };
  return {
    ...state,
    [layer]: [...state[layer], entry],
    nextSeq: state.nextSeq + 1,
  };
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
 * Scratch applies last so an experiment is not disturbed by a change arriving
 * underneath it — the what-if is the topmost answer to "what does this say".
 *
 * Every subtree an entry did not touch is the same object it was in the base, so
 * a reader holding one can compare by identity rather than by value.
 *
 * @param {DraftState} state
 * @param {string} jobID
 * @returns {object|undefined} Plain data, or undefined for a job not held
 */
export function draftFor(state, jobID) {
  const held = state.base[jobID];
  if (!held) return undefined;

  const entries = [
    ...state.log.filter((entry) => entry.jobID === jobID),
    ...state.scratch.filter((entry) => entry.jobID === jobID),
  ];
  return entries.reduce(
    (document, entry) => applyPatches(document, entry.patches),
    held,
  );
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
  if (jobID === undefined) return { ...state, log: [], scratch: [] };
  return {
    ...state,
    log: state.log.filter((entry) => entry.jobID !== jobID),
    scratch: state.scratch.filter((entry) => entry.jobID !== jobID),
  };
}

/**
 * Drops what the player asked about, leaving what they changed.
 *
 * @param {DraftState} state
 * @param {string} [jobID]
 * @returns {DraftState}
 */
export function leaveScratch(state, jobID) {
  if (jobID === undefined) return { ...state, scratch: [] };
  return {
    ...state,
    scratch: state.scratch.filter((entry) => entry.jobID !== jobID),
  };
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
  return {
    ...state,
    log: [...state.log, entry],
    scratch: state.scratch.filter((held) => held.seq !== seq),
  };
}

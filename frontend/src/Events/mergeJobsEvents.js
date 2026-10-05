import { eventEmitter } from "../utils/EventSystem";

/** The app event that opens the merge dialogue, to confirm what a merge discards or say why one was refused. */
export const MERGE_JOBS_EVENT = "mergeJobs";

/** Which question the merge dialogue is asking. */
export const MERGE_DIALOGUE_MODE = {
  CONFIRM: "confirm",
  REFUSED: "refused",
};

/** @type {((merge: boolean) => void) | null} */
let pendingAnswer = null;

/**
 * Asks the reader to confirm a merge that discards what the replaced jobs recorded; a question it
 * replaces is answered no.
 *
 * @param {Array<import("../Functions/Job/changes/mergeJobs.js").MergeDiscard>} discards
 * @returns {Promise<boolean>} Whether the reader chose to merge
 */
export function confirmMergeDiscards(discards) {
  answerMergeConfirmation(false);
  return new Promise((answer) => {
    pendingAnswer = answer;
    eventEmitter.emit(MERGE_JOBS_EVENT, {
      isOpen: true,
      mode: MERGE_DIALOGUE_MODE.CONFIRM,
      discards,
      moved: [],
    });
  });
}

/**
 * Answers the confirmation the merge dialogue is asking, if one is waiting.
 *
 * @param {boolean} merge - Whether the reader chose to merge
 */
export function answerMergeConfirmation(merge) {
  const answer = pendingAnswer;
  pendingAnswer = null;
  answer?.(merge);
}

/**
 * Shows the jobs that stopped a merge and offers to merge again from the current jobs.
 *
 * @param {Array<{jobID: string, name: string, reason: string}>} moved
 * @param {() => Promise<unknown>} mergeAgain
 */
export function showMergeRefused(moved, mergeAgain) {
  answerMergeConfirmation(false);
  eventEmitter.emit(MERGE_JOBS_EVENT, {
    isOpen: true,
    mode: MERGE_DIALOGUE_MODE.REFUSED,
    discards: [],
    moved,
    mergeAgain,
  });
}

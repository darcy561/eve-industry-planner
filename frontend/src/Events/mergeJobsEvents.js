import { eventEmitter } from "../utils/EventSystem";

/** The app event that opens the merge dialogue, to confirm what a merge discards or say why one was refused. */
export const MERGE_JOBS_EVENT = "mergeJobs";

/** Which question the merge dialogue is asking. */
export const MERGE_DIALOGUE_MODE = {
  CONFIRM: "confirm",
  REFUSED: "refused",
};

/**
 * Asks the reader to confirm a merge that discards what the replaced jobs recorded.
 *
 * @param {Array<import("../Functions/Job/changes/mergeJobs.js").MergeDiscard>} discards
 * @returns {Promise<boolean>} Whether the reader chose to merge
 */
export function confirmMergeDiscards(discards) {
  return new Promise((answer) => {
    eventEmitter.emit(MERGE_JOBS_EVENT, {
      isOpen: true,
      mode: MERGE_DIALOGUE_MODE.CONFIRM,
      discards,
      moved: [],
      answer,
    });
  });
}

/**
 * Shows the jobs that stopped a merge and offers to merge again from the current jobs.
 *
 * @param {Array<{jobID: string, name: string, reason: string}>} moved
 * @param {() => Promise<unknown>} mergeAgain
 */
export function showMergeRefused(moved, mergeAgain) {
  eventEmitter.emit(MERGE_JOBS_EVENT, {
    isOpen: true,
    mode: MERGE_DIALOGUE_MODE.REFUSED,
    discards: [],
    moved,
    mergeAgain,
  });
}

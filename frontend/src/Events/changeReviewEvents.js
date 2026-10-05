import { eventEmitter } from "../utils/EventSystem";

/** The app event that opens and closes the review of the reader's set-aside changes. */
export const CHANGE_REVIEW_EVENT = "changeReview";

/**
 * Opens the review of the job the editor is open on.
 *
 * @param {{refused?: boolean}} [opts] - Whether a save was just refused, rather than the reader asking
 */
export function openChangeReview({ refused = false } = {}) {
  eventEmitter.emit(CHANGE_REVIEW_EVENT, { isOpen: true, refused });
}

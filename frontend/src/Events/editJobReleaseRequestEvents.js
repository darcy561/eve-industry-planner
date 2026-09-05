/**
 * Coordination point between the document-lock slice and the edit-job page when
 * another session requests edit access while we hold the lock.
 *
 * When `useEditJobLeaveConfirm` is mounted (i.e. the holder is currently on
 * `/editjob/$jobID`) it registers a handler that opens the unsaved-changes
 * dialogue instead of immediately surrendering the lock. The dialogue drives the
 * outcome: save / discard both resolve to `proceed` (the slice continues with
 * the handover); closing/cancelling resolves to `cancelled` (the slice
 * dismisses the notice and the holder keeps editing).
 *
 * Pages that don't register a handler — group page, archived jobs, etc — see
 * the slice fall back to the existing direct-handover path via the
 * `not-handled` sentinel.
 *
 * @typedef {{ collection: string, docID: string }} EditJobReleaseRequestPayload
 * @typedef {"proceed" | "cancelled" | "not-handled"} EditJobReleaseRequestOutcome
 */

/** @type {null | ((payload: EditJobReleaseRequestPayload) => Promise<EditJobReleaseRequestOutcome>)} */
let releaseRequestHandler = null;

/**
 * @param {(payload: EditJobReleaseRequestPayload) => Promise<EditJobReleaseRequestOutcome>} fn
 */
export function registerEditJobReleaseRequestHandler(fn) {
  releaseRequestHandler = fn;
}

export function unregisterEditJobReleaseRequestHandler() {
  releaseRequestHandler = null;
}

/**
 * @param {EditJobReleaseRequestPayload} payload
 * @returns {Promise<EditJobReleaseRequestOutcome>}
 */
export function requestEditJobReleaseConfirmation(payload) {
  if (!releaseRequestHandler) {
    return Promise.resolve("not-handled");
  }
  return releaseRequestHandler(payload);
}

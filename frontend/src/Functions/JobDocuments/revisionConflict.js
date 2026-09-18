import { parseRefusalBody, refusalRowDocID } from "../Endpoints/refusalBody.js";

/**
 * A write refused because the document moved under it.
 *
 * Distinct from a lock conflict: a lock says somebody is holding the document,
 * a revision conflict says somebody has already written it. The client holding
 * one has a stale document rather than a blocked one.
 */

/**
 * Private HTTP 409 body `{ error, collection, saved, rejected }` when a write's
 * base revision is no longer current. Matches Go `helper.ErrCodeRevisionConflict`.
 *
 * @type {string}
 */
export const API_ERROR_REVISION_CONFLICT = "revision_conflict";

/**
 * `Error.code` after a revision-conflict 409 is recognised. Compare with
 * `err?.code === …`.
 *
 * @type {string}
 */
export const CLIENT_ERROR_REVISION_CONFLICT = "REVISION_CONFLICT";

/**
 * Reads a 409 body and answers the refused rows, or null when the body is not a
 * revision conflict.
 *
 * @param {string} text - Raw response body, already read from the `Response`.
 * @returns {{collection: string, saved: number, rejected: Array<{docID: string, expected: number, current: number, gone: boolean}>}|null}
 */
export function parseRevisionConflictBody(text) {
  return parseRefusalBody(text, API_ERROR_REVISION_CONFLICT, (row) => {
    const docID = refusalRowDocID(row);
    if (!docID) return null;
    return {
      docID,
      expected: typeof row.expected === "number" ? row.expected : 0,
      current: typeof row.current === "number" ? row.current : 0,
      gone: row.gone === true,
    };
  });
}

/**
 * The message a refused write shows the user.
 *
 * A deleted document and one that was rewritten are different situations: there
 * is nothing to reconcile against when the job is gone, so saying "changed"
 * would send the reader looking for a job that is not there.
 *
 * @param {Array<{gone: boolean}>} rejected
 * @returns {string}
 */
export function revisionConflictMessage(rejected) {
  const count = rejected.length;
  if (count > 0 && rejected.every((row) => row.gone)) {
    return count === 1
      ? "This job was removed while you had it open, so your changes were not saved."
      : `${count} jobs were removed while you had them open, so your changes were not saved.`;
  }
  return count === 1
    ? "This job was changed elsewhere while you had it open, so your changes were not saved. Reopen it to start from the current version."
    : `${count} jobs were changed elsewhere while you had them open, so your changes were not saved. Reopen them to start from the current version.`;
}

/**
 * Helpers for decoding the JSON payload returned by every
 * `/document-locks/{acquire,extend,request,status,...}` endpoint. The shape
 * has settled around a handful of optional numeric/string fields that several
 * callers (hook, slice, planner sync) all coerce the same way.
 *
 * Keeps the coercion in one place so the call sites stay short and the
 * numeric-or-null contract can't drift between them.
 */

/**
 * `data[key]` if it's a real number, otherwise `null`. Matches the
 * `typeof === "number" ? ... : null` pattern that previously littered every
 * grant-path patch.
 *
 * @param {Record<string, unknown> | null | undefined} data
 * @param {string} key
 * @returns {number | null}
 */
export function numberOrNull(data, key) {
  if (!data || typeof data !== "object") return null;
  const v = /** @type {Record<string, unknown>} */ (data)[key];
  return typeof v === "number" ? v : null;
}

/**
 * Construct the standard "holder granted" patch shape.
 *
 * Used by the four grant sites — `/acquire 201`, `/request 201`,
 * `/request 200 acquired:true`, and `/claim-handoff 200`. The
 * `{ withClearedHandoff: true }` variant additionally clears the lock's
 * handoff-state fields (used by `useDocumentLock.tryAcquire` and the claim
 * path) so the patch reads back as a clean new lease.
 *
 * @param {Record<string, unknown>} data — JSON body from the grant response
 * @param {{ withClearedHandoff?: boolean }} [options]
 * @returns {Record<string, unknown>}
 */
export function buildGrantedHolderPatch(data, options = {}) {
  const patch = {
    lockHeld: true,
    readOnly: false,
    waitingInHandoffQueue: false,
    lockExpiresAtUnix: numberOrNull(data, "expiresAtUnix"),
    lockTtlSeconds: numberOrNull(data, "ttlSeconds"),
  };
  if (options.withClearedHandoff === true) {
    patch.extendSegmentCount = 0;
    patch.waitlistLen = null;
    patch.handoffPendingHolder = false;
    patch.pendingHandoffOfferClientID = null;
    patch.pendingHandoffExpiresAtUnix = null;
    patch.handoffOfferForMe = false;
  }
  return patch;
}

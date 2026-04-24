import { selectScopedDocumentLock } from "./documentLockSelectors.js";
import {
  USER_JOB_GROUPS_COLLECTION,
  USER_JOBS_COLLECTION,
} from "./documentLockCollections.js";

/**
 * Stable Zustand selector functions for {@link ../../Components/DocumentLock/DocumentLockHeaderControl.jsx}.
 * Must stay as top-level references so `useSyncExternalStore` snapshots stay stable (Zustand v5 + React 19).
 */

/** Prefer job scope over group when both register (e.g. edit-job page). Lower = wins. */
function headerRegistrationRank(collection) {
  if (collection === USER_JOBS_COLLECTION) return 0;
  if (collection === USER_JOB_GROUPS_COLLECTION) return 1;
  return 2;
}

/** @param {*} s — usersStore root */
export function primaryHeaderRegistration(s) {
  const regs = s.headerDocumentLockUI.registrations;
  if (!Array.isArray(regs)) return null;
  const eligible = regs.filter(
    (r) => r.enabled !== false && r.collection && r.docID
  );
  if (eligible.length === 0) return null;
  if (eligible.length === 1) return eligible[0];

  eligible.sort((a, b) => {
    const dr =
      headerRegistrationRank(a.collection) - headerRegistrationRank(b.collection);
    if (dr !== 0) return dr;
    return regs.indexOf(a) - regs.indexOf(b);
  });
  return eligible[0];
}

/** @param {*} s */
export function selectHeaderLockScopeOk(s) {
  return primaryHeaderRegistration(s) != null;
}

/** @param {*} s */
export function selectHeaderDocumentLockActive(s) {
  return selectHeaderLockScopeOk(s);
}

/** @param {*} s */
export function selectHeaderDocumentLockReadOnlyStored(s) {
  const p = primaryHeaderRegistration(s);
  return p?.readOnlyMessage ?? null;
}

/** @param {*} s */
export function selectActiveDlReadOnly(s) {
  const p = primaryHeaderRegistration(s);
  if (!p?.collection || !p?.docID) return false;
  return selectScopedDocumentLock(s, p.collection, p.docID).readOnly;
}

/** @param {*} s */
export function selectActiveDlLockHeld(s) {
  const p = primaryHeaderRegistration(s);
  if (!p?.collection || !p?.docID) return false;
  return selectScopedDocumentLock(s, p.collection, p.docID).lockHeld;
}

/** @param {*} s */
export function selectActiveDlHandoffPendingHolder(s) {
  const p = primaryHeaderRegistration(s);
  if (!p?.collection || !p?.docID) return false;
  return selectScopedDocumentLock(s, p.collection, p.docID).handoffPendingHolder;
}

/** @param {*} s */
export function selectActiveDlLockExpiresAtUnix(s) {
  const p = primaryHeaderRegistration(s);
  if (!p?.collection || !p?.docID) return null;
  return selectScopedDocumentLock(s, p.collection, p.docID).lockExpiresAtUnix;
}

/** @param {*} s */
export function selectActiveDlLockTtlSeconds(s) {
  const p = primaryHeaderRegistration(s);
  if (!p?.collection || !p?.docID) return null;
  return selectScopedDocumentLock(s, p.collection, p.docID).lockTtlSeconds;
}

/** @param {*} s */
export function selectActiveDlExtendSegmentCount(s) {
  const p = primaryHeaderRegistration(s);
  if (!p?.collection || !p?.docID) return null;
  return selectScopedDocumentLock(s, p.collection, p.docID).extendSegmentCount;
}

/** @param {*} s */
export function selectActiveDlPendingAccessRequest(s) {
  const p = primaryHeaderRegistration(s);
  if (!p?.collection || !p?.docID) return false;
  return selectScopedDocumentLock(s, p.collection, p.docID).pendingAccessRequest;
}

/** @param {*} s */
export function selectActiveDlWaitlistLen(s) {
  const p = primaryHeaderRegistration(s);
  if (!p?.collection || !p?.docID) return null;
  return selectScopedDocumentLock(s, p.collection, p.docID).waitlistLen;
}

/** @param {*} s */
export function selectActiveDlWaitingInHandoffQueue(s) {
  const p = primaryHeaderRegistration(s);
  if (!p?.collection || !p?.docID) return false;
  return selectScopedDocumentLock(s, p.collection, p.docID).waitingInHandoffQueue;
}

/** @param {*} s */
export function selectActiveDlHandoffOfferForMe(s) {
  const p = primaryHeaderRegistration(s);
  if (!p?.collection || !p?.docID) return false;
  return selectScopedDocumentLock(s, p.collection, p.docID).handoffOfferForMe;
}

/** @param {*} s */
export function selectHeaderDocumentLockRegistrations(s) {
  const regs = s.headerDocumentLockUI.registrations;
  return Array.isArray(regs) ? regs : [];
}

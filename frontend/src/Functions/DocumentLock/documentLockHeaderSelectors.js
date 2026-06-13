import { selectScopedDocumentLock } from "./documentLockSelectors.js";
import {
  mergeScopedDocumentLockState,
  scopeHasOtherSessionContention,
} from "./documentLockScope.js";
import {
  USER_JOB_GROUPS_COLLECTION,
  USER_JOBS_COLLECTION,
} from "./documentLockCollections.js";

/**
 * Stable Zustand selector functions for {@link ../../Components/DocumentLock/DocumentLockHeaderControl.jsx}.
 * Must stay as top-level references so `useSyncExternalStore` snapshots stay stable (Zustand v5 + React 19).
 */

/** Group lock is authoritative for member jobs in a group edit session. */
function headerRegistrationRank(collection) {
  if (collection === USER_JOB_GROUPS_COLLECTION) return 0;
  if (collection === USER_JOBS_COLLECTION) return 1;
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

/**
 * True iff at least one enabled registration with a non-empty docID is
 * present. Drives whether the app bar mounts the document-lock control at all.
 *
 * @param {*} s
 */
export function selectHeaderDocumentLockActive(s) {
  return primaryHeaderRegistration(s) != null;
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
export function selectActiveDlLockScopeBootstrapped(s) {
  const p = primaryHeaderRegistration(s);
  if (!p?.collection || !p?.docID) return false;
  return (
    selectScopedDocumentLock(s, p.collection, p.docID).lockScopeBootstrapped ===
    true
  );
}

/** @param {*} s */
export function selectActiveDlViewerCount(s) {
  const p = primaryHeaderRegistration(s);
  if (!p?.collection || !p?.docID) return 0;
  const v = selectScopedDocumentLock(s, p.collection, p.docID).viewerCount;
  return typeof v === "number" ? v : 0;
}

/** @param {*} s */
export function selectHeaderDocumentLockRegistrations(s) {
  const regs = s.headerDocumentLockUI.registrations;
  return Array.isArray(regs) ? regs : [];
}

/**
 * True when any enabled registration other than the primary scope has contention
 * (read-only, waitlist, viewers, etc.). Edit Job registers job + group; the
 * primary drives the icon, but group queue must still surface the affordance.
 *
 * @param {*} s
 */
export function selectSecondaryDocumentLockContended(s) {
  const regs = selectHeaderDocumentLockRegistrations(s);
  if (regs.length <= 1) return false;
  const primary = primaryHeaderRegistration(s);
  if (!primary?.collection || !primary?.docID) return false;
  const scopes = s.documentLock?.scopes ?? {};
  for (const r of regs) {
    if (r.enabled === false || !r.collection || !r.docID) continue;
    if (r.collection === primary.collection && r.docID === primary.docID) {
      continue;
    }
    const st = mergeScopedDocumentLockState(scopes, r.collection, r.docID);
    if (scopeHasOtherSessionContention(st)) return true;
  }
  return false;
}

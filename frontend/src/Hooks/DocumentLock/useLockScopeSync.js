import { useEffect, useMemo } from "react";
import {
  getDocumentLockStateBatch,
  MAX_STATUS_BATCH_DOC_IDS,
} from "../../Functions/Endpoints/Pirivate/documentLockClient.js";
import { applyDocumentLockStatusFromPayload } from "../../Functions/DocumentLock/applyDocumentLockStatusFromPayload.js";
import useUsersStore from "../../Zustand/usersStore.js";
import {
  USER_JOBS_COLLECTION,
  USER_JOB_GROUPS_COLLECTION,
} from "../../Functions/DocumentLock/documentLockCollections.js";
import {
  DOCUMENT_LOCK_CUSTOM_EVENT,
  DOCUMENT_LOCK_DOMAIN_EVENTS,
} from "../../Functions/DocumentLock/documentLockEvents.js";
import { LOCK_SCOPE_SYNC_DEBOUNCE_MS } from "../../Functions/DocumentLock/documentLockTimings.js";
import {
  patchPlannerGroupLockScopeFromApi,
  patchPlannerJobLockScopeFromApi,
} from "./plannerLockScopeFromApi.js";
import { groupMemberJobScopeAfterGroupGrantPartial } from "../../Functions/DocumentLock/patchGroupMemberJobScopesAfterGroupGrant.js";

/**
 * Iterates the requested `(jobIDs, groupIDs)` arrays in `chunkSize`-sized
 * batches over `POST /document-locks/lock-state-batch`, applying every row through
 * `applyDocumentLockStatusFromPayload`. Groups (when present) are only sent
 * with the first chunk because they are far fewer than jobs and one batch
 * always carries the entire group set.
 *
 * Used by `useJobPlannerJobLockSync` (no groups) and
 * `useJobPlannerPageLockSync` (jobs + groups).
 *
 * @param {string[]} jobIDs
 * @param {string[]} groupIDs
 * @param {() => boolean} isCancelled
 * @param {number} chunkSize
 */
async function syncLockScopesFromApi(jobIDs, groupIDs, isCancelled, chunkSize) {
  const uj = [...new Set(jobIDs.filter(Boolean))];
  const ug = [...new Set(groupIDs.filter(Boolean))];
  if (uj.length === 0 && ug.length === 0) return;

  let offset = 0;
  let first = true;

  while (
    offset < uj.length ||
    (first && ug.length > 0 && uj.length === 0)
  ) {
    if (isCancelled()) return;
    const jobs = uj.slice(offset, offset + chunkSize);
    const groups = first ? ug : [];
    if (jobs.length === 0 && groups.length === 0) break;

    try {
      const res = await getDocumentLockStateBatch({
        jobDocIDs: jobs,
        groupDocIDs: groups,
      });
      if (!res.ok) {
        offset += chunkSize;
        first = false;
        continue;
      }
      const body = await res.json().catch(() => ({}));
      const jobRes =
        body.jobResults && typeof body.jobResults === "object"
          ? body.jobResults
          : {};
      const groupRes =
        body.groupResults && typeof body.groupResults === "object"
          ? body.groupResults
          : {};

      for (const jid of jobs) {
        const row = jobRes[jid];
        if (row && typeof row === "object") {
          applyDocumentLockStatusFromPayload(USER_JOBS_COLLECTION, jid, row);
        }
      }
      for (const gid of groups) {
        const row = groupRes[gid];
        if (row && typeof row === "object") {
          applyDocumentLockStatusFromPayload(
            USER_JOB_GROUPS_COLLECTION,
            gid,
            row
          );
        }
      }
    } catch {
      /* ignore */
    }

    offset += chunkSize;
    first = false;
  }
}

/**
 * Shared planner-page lock sync core for `useJobPlannerJobLockSync` and
 * `useJobPlannerPageLockSync`. Wraps three pieces of behaviour:
 *
 *   1. Debounced batch refresh when `jobIDs` or `groupIDs` change (coalesces
 *      rapid Zustand churn into a single round-trip).
 *   2. Listener on `eip-document-lock` so single-scope WS events refresh just
 *      that scope (avoids a full batch on every fan-out).
 *   3. Login gating — re-runs on `isLoggedIn` transitions only.
 *
 * @param {{
 *   getJobIDs: () => string[],
 *   getGroupIDs: () => string[],
 *   trackGroups: boolean,
 *   chunkSize: number,
 * }} options
 */
export function useLockScopeSync({
  getJobIDs,
  getGroupIDs,
  trackGroups,
  chunkSize,
}) {
  const isLoggedIn = useUsersStore((s) => s.account.isLoggedIn);
  const jobArray = useUsersStore((s) => s.jobData.jobArray);
  const groupArray = useUsersStore((s) => s.jobData.groupArray);

  /**
   * Single string key so React can compare cheaply; reruns the debounced
   * fetch when any jobID set membership changes (and, on the page hook, any
   * groupID).
   */
  const syncKey = useMemo(() => {
    const jobs = jobArray
      .map((j) => j.jobID)
      .sort()
      .join("\0");
    if (!trackGroups) return jobs;
    const groups = groupArray
      .map((g) => g.groupID)
      .sort()
      .join("\0");
    return `${jobs}|${groups}`;
  }, [jobArray, groupArray, trackGroups]);

  useEffect(() => {
    if (!isLoggedIn) return undefined;

    let cancelled = false;
    const debounceId = window.setTimeout(() => {
      const jobIDs = getJobIDs();
      const groupIDs = trackGroups ? getGroupIDs() : [];
      if (jobIDs.length === 0 && groupIDs.length === 0) return;
      void syncLockScopesFromApi(
        jobIDs,
        groupIDs,
        () => cancelled,
        chunkSize
      );
    }, LOCK_SCOPE_SYNC_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(debounceId);
    };
  }, [isLoggedIn, syncKey, getJobIDs, getGroupIDs, trackGroups, chunkSize]);

  useEffect(() => {
    if (!isLoggedIn) return undefined;

    function onDocumentLockEvent(ev) {
      const p = ev?.detail;
      if (!p || typeof p !== "object") return;

      const t = typeof p.event === "string" ? p.event : p.type;

      /**
       * Group → jobs cascade event. Apply every release directly to the
       * store in one `patchManyDocumentLockScopes` call instead of
       * firing N `patchPlannerJobLockScopeFromApi` HTTP refetches. The
       * server has already DEL-ed the lock keys (see
       * `documentlock/cascade_pipeline.go`), so the payload's contents
       * are authoritative.
       */
      if (t === DOCUMENT_LOCK_DOMAIN_EVENTS.GROUP_CASCADE) {
        if (!Array.isArray(p.releases) || p.releases.length === 0) return;
        if (p.collection !== USER_JOBS_COLLECTION) return;
        const updates = [];
        for (const r of p.releases) {
          if (!r || typeof r.docID !== "string" || !r.docID) continue;
          updates.push({
            collection: USER_JOBS_COLLECTION,
            docID: r.docID,
            partial: groupMemberJobScopeAfterGroupGrantPartial(),
          });
        }
        if (updates.length > 0) {
          useUsersStore
            .getState()
            .documentLock.actions.patchManyDocumentLockScopes(updates);
        }
        return;
      }

      // Edit-job / header UX handles `document_lock_requested` via
      // `useLockWsListener` (snackbar + `pendingAccessRequest`). Refetching
      // planner lock-state here does not drive planner cards and can reorder
      // after the snackbar path; skip the extra GET.
      if (t === DOCUMENT_LOCK_DOMAIN_EVENTS.REQUESTED) {
        return;
      }

      if (!p.docID) return;
      if (p.collection === USER_JOBS_COLLECTION) {
        void patchPlannerJobLockScopeFromApi(p.docID);
        return;
      }
      if (trackGroups && p.collection === USER_JOB_GROUPS_COLLECTION) {
        void patchPlannerGroupLockScopeFromApi(p.docID);
      }
    }

    window.addEventListener(DOCUMENT_LOCK_CUSTOM_EVENT, onDocumentLockEvent);
    return () =>
      window.removeEventListener(
        DOCUMENT_LOCK_CUSTOM_EVENT,
        onDocumentLockEvent
      );
  }, [isLoggedIn, trackGroups]);
}

import { useEffect, useMemo } from "react";
import { getDocumentLockStatusBatch } from "../../Functions/Endpoints/Pirivate/documentLockClient.js";
import { applyDocumentLockStatusFromPayload } from "../../Functions/DocumentLock/applyDocumentLockStatusFromPayload.js";
import useUsersStore from "../../Zustand/usersStore.js";
import {
  USER_JOB_GROUPS_COLLECTION,
  USER_JOBS_COLLECTION,
} from "../../Functions/DocumentLock/documentLockCollections.js";
import {
  patchPlannerGroupLockScopeFromApi,
  patchPlannerJobLockScopeFromApi,
} from "./useJobPlannerJobLockSync.js";

/** Stay below server max (500) per array; include groups only on the first chunk. */
const PLANNER_PAGE_JOB_CHUNK = 450;

/** Coalesce rapid job/group list churn into one lock sync (WS or HTTP batch). */
const LOCK_SCOPE_SYNC_DEBOUNCE_MS = 200;

async function syncPlannerPageLocksFromApi(jobIDs, groupIDs, isCancelled) {
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
    const jobs = uj.slice(offset, offset + PLANNER_PAGE_JOB_CHUNK);
    const groups = first ? ug : [];
    if (jobs.length === 0 && groups.length === 0) break;

    try {
      const res = await getDocumentLockStatusBatch({
        jobDocIDs: jobs,
        groupDocIDs: groups,
      });
      if (!res.ok) {
        offset += PLANNER_PAGE_JOB_CHUNK;
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

    offset += PLANNER_PAGE_JOB_CHUNK;
    first = false;
  }
}

/**
 * Fetches lock state for all planner jobs and groups in one `status-batch` call per chunk (Job Planner route only).
 */
export function useJobPlannerPageLockSync() {
  const isLoggedIn = useUsersStore((s) => s.account.isLoggedIn);
  const jobArray = useUsersStore((s) => s.jobData.jobArray);
  const groupArray = useUsersStore((s) => s.jobData.groupArray);

  const syncKey = useMemo(
    () =>
      [
        jobArray
          .map((j) => j.jobID)
          .sort()
          .join("\0"),
        groupArray
          .map((g) => g.groupID)
          .sort()
          .join("\0"),
      ].join("|"),
    [jobArray, groupArray]
  );

  useEffect(() => {
    if (!isLoggedIn) return undefined;

    let cancelled = false;
    const debounceId = window.setTimeout(() => {
      const jobIDs = useUsersStore.getState().jobData.jobArray.map((j) => j.jobID);
      const groupIDs = useUsersStore
        .getState()
        .jobData.groupArray.map((g) => g.groupID);
      if (jobIDs.length === 0 && groupIDs.length === 0) return;
      void syncPlannerPageLocksFromApi(jobIDs, groupIDs, () => cancelled);
    }, LOCK_SCOPE_SYNC_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(debounceId);
    };
  }, [isLoggedIn, syncKey]);

  useEffect(() => {
    if (!isLoggedIn) return undefined;

    function onDocumentLockEvent(ev) {
      const p = ev?.detail;
      if (!p || typeof p !== "object" || !p.docID) return;
      if (p.collection === USER_JOBS_COLLECTION) {
        void patchPlannerJobLockScopeFromApi(p.docID);
        return;
      }
      if (p.collection === USER_JOB_GROUPS_COLLECTION) {
        void patchPlannerGroupLockScopeFromApi(p.docID);
      }
    }

    window.addEventListener("eip-document-lock", onDocumentLockEvent);
    return () =>
      window.removeEventListener("eip-document-lock", onDocumentLockEvent);
  }, [isLoggedIn]);
}

import { useEffect, useMemo } from "react";
import {
  getDocumentLockStatus,
  getDocumentLockStatusBatch,
  MAX_STATUS_BATCH_DOC_IDS,
} from "../../Functions/Endpoints/Pirivate/documentLockClient.js";
import { applyDocumentLockStatusFromPayload } from "../../Functions/DocumentLock/applyDocumentLockStatusFromPayload.js";
import useUsersStore from "../../Zustand/usersStore.js";
import {
  USER_JOBS_COLLECTION,
  USER_JOB_GROUPS_COLLECTION,
} from "../../Functions/DocumentLock/documentLockCollections.js";

/** Must stay at or below server `maxStatusBatchDocs` ({@link MAX_STATUS_BATCH_DOC_IDS}). */
const STATUS_BATCH_MAX = MAX_STATUS_BATCH_DOC_IDS;

const LOCK_SCOPE_SYNC_DEBOUNCE_MS = 200;

export async function patchPlannerJobLockScopeFromApi(jobID) {
  if (!jobID) return;
  try {
    const res = await getDocumentLockStatus(USER_JOBS_COLLECTION, jobID);
    if (!res.ok) return;
    const data = await res.json().catch(() => ({}));
    applyDocumentLockStatusFromPayload(USER_JOBS_COLLECTION, jobID, data);
  } catch {
    /* ignore */
  }
}

export async function patchPlannerGroupLockScopeFromApi(groupID) {
  if (!groupID) return;
  try {
    const res = await getDocumentLockStatus(
      USER_JOB_GROUPS_COLLECTION,
      groupID
    );
    if (!res.ok) return;
    const data = await res.json().catch(() => ({}));
    applyDocumentLockStatusFromPayload(
      USER_JOB_GROUPS_COLLECTION,
      groupID,
      data
    );
  } catch {
    /* ignore */
  }
}

async function syncAllPlannerJobLocksFromApi(jobIDs, isCancelled) {
  const unique = [...new Set(jobIDs.filter(Boolean))];
  if (unique.length === 0) return;

  for (let i = 0; i < unique.length; i += STATUS_BATCH_MAX) {
    if (isCancelled()) return;
    const chunk = unique.slice(i, i + STATUS_BATCH_MAX);
    try {
      const res = await getDocumentLockStatusBatch({
        jobDocIDs: chunk,
        groupDocIDs: [],
      });
      if (!res.ok) continue;
      const body = await res.json().catch(() => ({}));
      const results =
        body.jobResults && typeof body.jobResults === "object"
          ? body.jobResults
          : {};
      for (const jid of chunk) {
        const row = results[jid];
        if (row && typeof row === "object") {
          applyDocumentLockStatusFromPayload(
            USER_JOBS_COLLECTION,
            jid,
            row
          );
        }
      }
    } catch {
      /* ignore */
    }
  }
}

export function useJobPlannerJobLockSync() {
  const isLoggedIn = useUsersStore((s) => s.account.isLoggedIn);
  const jobArray = useUsersStore((s) => s.jobData.jobArray);

  const idKey = useMemo(
    () =>
      jobArray
        .map((j) => j.jobID)
        .sort()
        .join("\0"),
    [jobArray]
  );

  useEffect(() => {
    if (!isLoggedIn) return undefined;

    let cancelled = false;
    const debounceId = window.setTimeout(() => {
      const ids = useUsersStore.getState().jobData.jobArray.map((j) => j.jobID);
      if (ids.length === 0) return;
      void syncAllPlannerJobLocksFromApi(ids, () => cancelled);
    }, LOCK_SCOPE_SYNC_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(debounceId);
    };
  }, [isLoggedIn, idKey]);

  useEffect(() => {
    if (!isLoggedIn) return undefined;

    function onDocumentLockEvent(ev) {
      const p = ev?.detail;
      if (!p || typeof p !== "object") return;
      if (p.collection !== USER_JOBS_COLLECTION || !p.docID) return;
      void patchPlannerJobLockScopeFromApi(p.docID);
    }

    window.addEventListener("eip-document-lock", onDocumentLockEvent);
    return () =>
      window.removeEventListener("eip-document-lock", onDocumentLockEvent);
  }, [isLoggedIn]);
}

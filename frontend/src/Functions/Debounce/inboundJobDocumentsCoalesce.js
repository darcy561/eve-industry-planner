/**
 * Coalesces rapid `user_job_documents` WS deliveries into fewer Zustand updates.
 */

import Job from "../../Classes/job.js";
import useUsersStore from "../../Zustand/usersStore.js";
import { metaLastModifiedMs } from "../../Zustand/realtimeSyncSlice.js";
import { createCoalesceFlush } from "./helpers/createCoalesceFlush.js";

const FLUSH_MS = 80;

/** @type {Map<string, Record<string, unknown>>} */
let pendingUpserts = new Map();
/** @type {Set<string>} */
let pendingDeletes = new Set();

/**
 * Registers a per-stage skeleton for remote upserts that are new to this client.
 * Skips updates to jobs we already have, and jobs we are saving locally.
 *
 * @param {string} docID
 * @param {Record<string, unknown>} document
 */
function maybeRegisterInboundNewJobSkeleton(docID, document) {
  const state = useUsersStore.getState();
  const { jobArray, pendingJobDocumentWrites, actions } = state.jobData;
  if (jobArray.some((j) => j.jobID === docID)) {
    return;
  }
  if (pendingJobDocumentWrites.includes(docID)) {
    return;
  }
  const stageId = Number(document.jobStatus ?? 0);
  const groupID =
    document.groupID != null && document.groupID !== ""
      ? String(document.groupID)
      : "";
  actions.addPendingInboundNewJobSkeleton(docID, { stageId, groupID });
}

function flush() {
  const { account, jobData: { actions }, realtimeSync: { actions: rs } } = useUsersStore.getState();
  if (!account.isLoggedIn || account.accountID == null) {
    pendingUpserts = new Map();
    pendingDeletes = new Set();
    return;
  }

  if (pendingDeletes.size > 0) {
    const ids = [...pendingDeletes];
    for (const id of ids) {
      pendingUpserts.delete(id);
    }
    pendingDeletes = new Set();
    actions.removePendingInboundNewJobSkeletons(ids);
    actions.removeJobsFromJobArray(ids);
    ids.forEach((jobID) => {
      actions.clearPendingJobDocumentWrites(jobID);
      rs.setCursorMs(`user_job_documents.${jobID}`, Date.now());
    });
  }

  if (pendingUpserts.size > 0) {
    const entries = [...pendingUpserts.entries()];
    pendingUpserts = new Map();
    actions.removePendingInboundNewJobSkeletons(entries.map(([id]) => id));
    const jobs = entries.map(([, doc]) => new Job(doc));
    actions.updateOrAddJobsToJobArray(jobs);
    entries.forEach(([jobID, doc]) => {
      const ms = metaLastModifiedMs(doc);
      if (ms != null) {
        rs.setCursorMs(`user_job_documents.${jobID}`, ms);
      }
      actions.clearPendingJobDocumentWrites(jobID);
    });
  }
}

const coalesce = createCoalesceFlush({
  delayMs: FLUSH_MS,
  onFlush: flush,
});

/**
 * After sign-out or before tearing down the session, cancel any pending coalesced flush
 * and drop in-memory WS job payloads. Otherwise a timer may still run and re-add jobs
 * to Zustand after `resetJobDataStore`.
 */
export function clearInboundJobDocumentCoalesce() {
  coalesce.cancel();
  pendingUpserts = new Map();
  pendingDeletes = new Set();
}

/**
 * @param {"upsert"|"delete"} kind
 * @param {string} docID - Mongo _id / jobID
 * @param {Record<string, unknown>|undefined} document - full document for upsert
 */
export function enqueueInboundJobDocumentChange(kind, docID, document) {
  if (!docID) return;
  if (kind === "delete") {
    pendingDeletes.add(docID);
    pendingUpserts.delete(docID);
    useUsersStore
      .getState()
      .jobData.actions.removePendingInboundNewJobSkeletons([docID]);
  } else if (document && typeof document === "object") {
    // Out-of-order WS: a delete may already be queued; never let a stale upsert cancel it
    // or the next flush would resurrect the row (intermittent missing deletes / ghost jobs).
    if (pendingDeletes.has(docID)) {
      return;
    }
    pendingUpserts.set(docID, document);
    pendingDeletes.delete(docID);
    maybeRegisterInboundNewJobSkeleton(docID, document);
  }
  coalesce.scheduleFlush();
}

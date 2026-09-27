/**
 * Coalesces rapid `job_documents` WS deliveries into fewer Zustand updates.
 */

import { jobFromDocument, toDocument } from "../JobDocuments/jobDocument.js";
import { USER_JOB_DOCUMENTS_COLLECTION } from "../Endpoints/Private/jobDocuments.js";
import useUsersStore from "../../Zustand/usersStore.js";
import { createCoalesceFlush } from "./helpers/createCoalesceFlush.js";

const FLUSH_MS = 80;

/** @type {Map<string, {document: Record<string, unknown>, position: number|null}>} */
let pendingUpserts = new Map();
/** @type {Map<string, number|null>} */
let pendingDeletes = new Map();

/**
 * Which of two deliveries for one document happened later, a delete winning where
 * neither carries a position.
 *
 * @param {number|null} candidate
 * @param {number|null} queued
 * @returns {boolean} true when the candidate is known to be the later one
 */
function isLaterThan(candidate, queued) {
  return (
    Number.isFinite(candidate) && Number.isFinite(queued) && candidate > queued
  );
}

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
  if (docID in (pendingJobDocumentWrites ?? {})) {
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
  const {
    account,
    jobData: { actions },
    websocketSync: { actions: rs },
    editSession,
  } = useUsersStore.getState();
  if (!account.isLoggedIn || account.accountID == null) {
    pendingUpserts = new Map();
    pendingDeletes = new Map();
    return;
  }

  if (pendingDeletes.size > 0) {
    const entries = [...pendingDeletes.entries()];
    const ids = entries.map(([id]) => id);
    pendingDeletes = new Map();
    actions.removePendingInboundNewJobSkeletons(ids);
    actions.removeJobsFromJobArray(ids);
    actions.clearPendingJobDocumentWrites(ids);
    window.dispatchEvent(
      new CustomEvent(JOBS_DELETED_REMOTELY_EVENT, { detail: { jobIDs: ids } }),
    );
    rs.setPositionBatch(
      entries
        .filter(([, position]) => Number.isFinite(position))
        .map(([jobID, position]) => [
          `${USER_JOB_DOCUMENTS_COLLECTION}.${jobID}`,
          position,
        ]),
    );
  }

  if (pendingUpserts.size > 0) {
    const entries = [...pendingUpserts.entries()];
    pendingUpserts = new Map();
    actions.removePendingInboundNewJobSkeletons(entries.map(([id]) => id));
    const arrived = entries.map(([jobID, held]) => [
      jobID,
      jobFromDocument(held.document),
    ]);
    actions.updateOrAddJobsToJobArray(arrived.map(([, job]) => job));
    for (const [jobID, job] of arrived) {
      editSession.actions.documentArrived(jobID, toDocument(job));
    }
    rs.setPositionBatch(
      entries
        .filter(([, held]) => Number.isFinite(held.position))
        .map(([jobID, held]) => [
          `${USER_JOB_DOCUMENTS_COLLECTION}.${jobID}`,
          held.position,
        ]),
    );
    actions.clearPendingJobDocumentWrites(entries.map(([id]) => id));
  }
}

const coalesce = createCoalesceFlush({
  delayMs: FLUSH_MS,
  onFlush: flush,
});

/**
 * Cancels any pending coalesced flush and drops the delivered payloads held in
 * memory, for a session being torn down.
 */
export function clearInboundJobDocumentCoalesce() {
  coalesce.cancel();
  pendingUpserts = new Map();
  pendingDeletes = new Map();
}

/**
 * Raised when jobs this client held were deleted somewhere else, carrying the ids
 * in `detail.jobIDs`, once the job arrays are already correct.
 */
export const JOBS_DELETED_REMOTELY_EVENT = "eip-jobs-deleted-remotely";

/**
 * @param {"upsert"|"delete"} kind
 * @param {string} docID - Mongo _id / jobID
 * @param {Record<string, unknown>|undefined} document - full document for upsert
 * @param {number|null} [position] - the delivery's place in the stream
 */
export function enqueueInboundJobDocumentChange(
  kind,
  docID,
  document,
  position = null,
) {
  if (!docID) return;
  if (kind === "delete") {
    const queued = pendingUpserts.get(docID);
    if (queued && isLaterThan(queued.position, position)) {
      return;
    }
    pendingDeletes.set(docID, position);
    pendingUpserts.delete(docID);
    useUsersStore
      .getState()
      .jobData.actions.removePendingInboundNewJobSkeletons([docID]);
  } else if (document && typeof document === "object") {
    if (
      pendingDeletes.has(docID) &&
      !isLaterThan(position, pendingDeletes.get(docID))
    ) {
      return;
    }
    pendingUpserts.set(docID, { document, position });
    pendingDeletes.delete(docID);
    maybeRegisterInboundNewJobSkeleton(docID, document);
  }
  coalesce.scheduleFlush();
}

/**
 * Coalesces rapid `job_documents` WS deliveries into fewer Zustand updates.
 */

import Job from "../../Classes/job.js";
import { USER_JOB_DOCUMENTS_COLLECTION } from "../Endpoints/Private/jobDocuments.js";
import useUsersStore from "../../Zustand/usersStore.js";
import { createCoalesceFlush } from "./helpers/createCoalesceFlush.js";

const FLUSH_MS = 80;

/** @type {Map<string, {document: Record<string, unknown>, position: number|null}>} */
let pendingUpserts = new Map();
/** @type {Map<string, number|null>} */
let pendingDeletes = new Map();

/**
 * Which of two deliveries for one document happened later.
 *
 * Without positions there is no answer, and a delete wins — the older rule, kept
 * for a server that sends none, because resurrecting a deleted row is the worse
 * of the two mistakes.
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
  const {
    account,
    jobData: { actions },
    websocketSync: { actions: rs },
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
    actions.updateOrAddJobsToJobArray(
      entries.map(([, held]) => new Job(held.document)),
    );
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
 * After sign-out or before tearing down the session, cancel any pending coalesced flush
 * and drop in-memory WS job payloads. Otherwise a timer may still run and re-add jobs
 * to Zustand after `resetJobDataStore`.
 */
export function clearInboundJobDocumentCoalesce() {
  coalesce.cancel();
  pendingUpserts = new Map();
  pendingDeletes = new Map();
}

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
    // An upsert known to be later is the one that happened: restoring an archived
    // job writes the same id back, and both deliveries can land inside one flush.
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

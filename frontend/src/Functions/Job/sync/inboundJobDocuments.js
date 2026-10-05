import { jobFromDocument, toDocument } from "../jobDocument.js";
import {
  DELTA_APPLIES,
  DELTA_SEEN,
  applyJobDelta,
  deltaVerdict,
  revisionOf,
} from "./jobDelta.js";
import { USER_JOB_DOCUMENTS_COLLECTION } from "../../Endpoints/Private/jobDocuments.js";
import { requestJobDocumentsByIdsFromApi } from "../../Endpoints/Private/requestJobDocumentsByIds.js";
import useUsersStore from "../../../Zustand/usersStore.js";
import { createCoalesceFlush } from "../../Debounce/helpers/createCoalesceFlush.js";

const FLUSH_MS = 80;

/** @type {Map<string, {document: Record<string, unknown>, base: Record<string, unknown>|null, deltas: object[], position: number|null}>} */
let pendingUpserts = new Map();
/** @type {Map<string, number|null>} */
let pendingDeletes = new Map();
/** @type {Set<string>} */
const rereading = new Set();
/** @type {Set<string>} */
const rereadAgain = new Set();
let generation = 0;

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
    jobData,
    websocketSync: { actions: rs },
    editSession,
  } = useUsersStore.getState();
  const { actions } = jobData;
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

    const settled = [];
    const missed = [];
    for (const [jobID, held] of entries) {
      const document = foldPendingChange(jobID, held, jobData);
      if (document === null) {
        missed.push(jobID);
        continue;
      }
      settled.push([jobID, held, jobFromDocument(document)]);
    }
    if (missed.length > 0) {
      rereadJobDocuments(missed);
    }

    const arrived = settled.map(([jobID, , job]) => [jobID, job]);
    actions.updateOrAddJobsToJobArray(arrived.map(([, job]) => job));
    for (const [jobID, job] of arrived) {
      editSession.actions.documentArrived(jobID, toDocument(job));
    }
    rs.setPositionBatch(
      settled
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
  rereading.clear();
  rereadAgain.clear();
  generation += 1;
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
 * @param {object|null} [delta] - what the delivery said changed, where it said
 */
export function enqueueInboundJobDocumentChange(
  kind,
  docID,
  document,
  position = null,
  delta = null,
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
    const queued = pendingUpserts.get(docID);
    pendingUpserts.set(
      docID,
      delta
        ? {
            document,
            base: queued?.base ?? null,
            deltas: [...(queued?.deltas ?? []), delta],
            position,
          }
        : { document, base: document, deltas: [], position },
    );
    pendingDeletes.delete(docID);
    maybeRegisterInboundNewJobSkeleton(docID, document);
  }
  coalesce.scheduleFlush();
}

/**
 * Folds what arrived for one job onto the whole document this window last saw, or
 * the one the client holds, answering null where a delivery was missed.
 *
 * @param {string} jobID
 * @param {{document: Record<string, unknown>, base: Record<string, unknown>|null, deltas: object[]}} held
 * @param {object} jobData - The job store's slice
 * @returns {Record<string, unknown>|null}
 */
function foldPendingChange(jobID, held, jobData) {
  if (held.deltas.length === 0) return held.document;
  if (jobID in (jobData.pendingJobDocumentWrites ?? {})) return held.document;

  const known = held.base ? null : jobData.actions.findJobInJobArray(jobID);
  let document = held.base ?? (known ? toDocument(known) : null);
  if (!document) return held.document;

  for (const delta of held.deltas) {
    const verdict = deltaVerdict(revisionOf(document), delta);
    if (verdict === DELTA_SEEN) continue;
    if (verdict !== DELTA_APPLIES) return null;
    document = applyJobDelta(document, delta);
  }
  return document;
}

/**
 * Reads jobs whose deliveries did not join up, asking again for one that gapped
 * while its read was still out, which may have read before the newer write.
 *
 * @param {string[]} jobIDs
 */
function rereadJobDocuments(jobIDs) {
  for (const jobID of jobIDs) {
    if (rereading.has(jobID)) {
      rereadAgain.add(jobID);
      continue;
    }
    rereading.add(jobID);
    const askedIn = {
      generation,
      planner: activePlannerOwner(),
    };
    requestJobDocumentsByIdsFromApi([jobID])
      .then(([job]) => job && takeRereadJob(jobID, job, askedIn))
      .catch(() => {})
      .finally(() => {
        if (askedIn.generation !== generation) return;
        rereading.delete(jobID);
        if (rereadAgain.delete(jobID)) rereadJobDocuments([jobID]);
      });
  }
}

/**
 * Takes a re-read job, unless the session or planner it was asked for has gone,
 * the job has, or what the client now holds is already as far on.
 *
 * @param {string} jobID
 * @param {object} job
 * @param {{generation: number, planner: string|null}} askedIn
 */
function takeRereadJob(jobID, job, askedIn) {
  if (askedIn.generation !== generation) return;
  if (askedIn.planner !== activePlannerOwner()) return;

  const { actions } = useUsersStore.getState().jobData;
  const known = actions.findJobInJobArray(jobID);
  if (!known) return;

  const document = toDocument(job);
  const read = revisionOf(document);
  const current = revisionOf(toDocument(known));
  if (Number.isFinite(read) && Number.isFinite(current) && current >= read) {
    return;
  }

  actions.updateOrAddJobsToJobArray([job]);
  useUsersStore.getState().editSession.actions.documentArrived(jobID, document);
}

function activePlannerOwner() {
  return (
    useUsersStore
      .getState()
      .activePlanner?.actions?.getActivePlannerOwner?.() ?? null
  );
}

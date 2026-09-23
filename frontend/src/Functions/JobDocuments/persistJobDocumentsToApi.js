import { putJobDocumentsBatch } from "../Endpoints/Private/jobDocuments.js";
import { DOCUMENT_LOCK_CLIENT_ERROR_LOCK_HELD_ELSEWHERE } from "../DocumentLock/documentLockEvents.js";
import {
  CLIENT_ERROR_REVISION_CONFLICT,
  revisionConflictMessage,
} from "./revisionConflict.js";
import { showSnackbarWarning } from "../../Events/snackbarEvents.js";
import useUsersStore from "../../Zustand/usersStore.js";

/**
 * What a flush did, for a caller that has to tell a write that landed from one
 * that was refused.
 *
 * `"saved"` covers a flush with nothing queued: the caller's writes are not
 * outstanding either way, and a caller that has to distinguish those has asked
 * the wrong question.
 *
 * @typedef {"saved" | "locked" | "conflict" | "failed"} JobDocumentPersistOutcome
 */

/**
 * Persists dirty job documents (`PUT /api/v1/job-documents`) for IDs in `pendingJobDocumentWrites`.
 *
 * The warning a refused write shows is raised here rather than by each caller:
 * every job write in the SPA funnels through this queue, and the message is the
 * same wherever the write came from.
 *
 * @returns {Promise<JobDocumentPersistOutcome>}
 */
/**
 * The jobs a refused save had already written before the part that failed.
 *
 * A save above the request limit goes in parts, and a refusal answers the one
 * part it came from. The parts that landed are named on the error instead.
 *
 * @param {Error & {deliveredBatchItems?: Array<{jobID?: string}>}} err
 * @returns {Array<string>}
 */
function deliveredJobIDs(err) {
  return (err?.deliveredBatchItems ?? [])
    .map((job) => job?.jobID)
    .filter(Boolean);
}

export async function persistJobDocumentsToApi() {
  try {
    if (!useUsersStore.getState().account.isLoggedIn) {
      return "saved";
    }

    const { jobData } = useUsersStore.getState();
    const {
      getPendingJobDocumentWritesPayload,
      clearPendingJobDocumentWrites,
      countWrittenJobRevisions,
    } = jobData.actions;
    const queuedIds = Object.keys(jobData.pendingJobDocumentWrites ?? {});
    if (queuedIds.length === 0) {
      return "saved";
    }

    const jobs = getPendingJobDocumentWritesPayload();
    if (jobs.length === 0) {
      clearPendingJobDocumentWrites(queuedIds);
      return "saved";
    }

    await putJobDocumentsBatch(jobs);
    countWrittenJobRevisions(jobs.map((job) => job.jobID));
    clearPendingJobDocumentWrites(queuedIds);
    return "saved";
  } catch (err) {
    // A lock conflict no longer means nothing was written: the server drops the
    // held jobs and writes the rest, and names the ones it wrote. Only those are
    // cleared — anything else stays queued, whether it was held or refused for
    // another reason the answer does not mention.
    if (err?.code === DOCUMENT_LOCK_CLIENT_ERROR_LOCK_HELD_ELSEWHERE) {
      // A conflict that names no document cannot be told apart from one naming
      // every document, so the whole queue is kept rather than guessed at.
      // Clearing on an empty list would discard edits nothing wrote.
      const held = err.lockHeldDocIDs ?? [];
      if (held.length > 0) {
        const wrote = [...deliveredJobIDs(err), ...(err.savedDocIDs ?? [])];
        if (wrote.length > 0) {
          const { actions } = useUsersStore.getState().jobData;
          actions.countWrittenJobRevisions(wrote);
          actions.clearPendingJobDocumentWrites(wrote);
        }
      }
      return "locked";
    }
    // A refused write is dropped from the queue rather than kept. The queue
    // holds job ids and resolves them against `jobArray` at flush time, so
    // keeping them would re-send whatever the array holds — against a document
    // the server has already said is no longer the one this write was built
    // from. That write cannot start succeeding, so retrying it is an endless
    // loop the user is never told about.
    //
    // Only the documents the answer names are dropped, never the whole queue: a
    // batch over the request limit is sent in parts, and the part that failed is
    // the only one this answer is about.
    if (err?.code === CLIENT_ERROR_REVISION_CONFLICT) {
      const rejected = err.revisionConflict?.rejected ?? [];
      const wrote = [
        ...deliveredJobIDs(err),
        ...(err.revisionConflict?.savedDocIDs ?? []),
      ];
      const { actions } = useUsersStore.getState().jobData;
      actions.countWrittenJobRevisions(wrote);
      actions.clearPendingJobDocumentWrites([
        ...wrote,
        ...rejected.map((row) => row.docID).filter(Boolean),
      ]);
      showSnackbarWarning(revisionConflictMessage(rejected), 8);
      return "conflict";
    }
    console.error("Error saving job documents to API", err);
    return "failed";
  }
}

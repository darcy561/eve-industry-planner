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
export async function persistJobDocumentsToApi() {
  let queuedIds = [];
  try {
    if (!useUsersStore.getState().account.isLoggedIn) {
      return "saved";
    }

    const { jobData } = useUsersStore.getState();
    const {
      getPendingJobDocumentWritesPayload,
      clearPendingJobDocumentWrites,
    } = jobData.actions;
    queuedIds = [...new Set(jobData.pendingJobDocumentWrites ?? [])];
    if (queuedIds.length === 0) {
      return "saved";
    }

    const jobs = getPendingJobDocumentWritesPayload();
    if (jobs.length === 0) {
      clearPendingJobDocumentWrites(queuedIds);
      return "saved";
    }

    await putJobDocumentsBatch(jobs);
    clearPendingJobDocumentWrites(queuedIds);
    return "saved";
  } catch (err) {
    // A lock conflict no longer means nothing was written: the server drops the
    // held jobs and writes the rest. So only the held ids stay queued — keeping
    // the whole batch would re-send jobs that already saved, and clearing it
    // would lose the edits that are still owed.
    if (err?.code === DOCUMENT_LOCK_CLIENT_ERROR_LOCK_HELD_ELSEWHERE) {
      // A conflict that names no document cannot be told apart from one naming
      // every document, so the whole queue is kept rather than guessed at.
      // Clearing on an empty list would discard edits nothing wrote.
      const held = err.lockHeldDocIDs ?? [];
      if (held.length > 0) {
        const blocked = new Set(held);
        const wrote = queuedIds.filter((id) => !blocked.has(id));
        if (wrote.length > 0) {
          useUsersStore
            .getState()
            .jobData.actions.clearPendingJobDocumentWrites(wrote);
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
    if (err?.code === CLIENT_ERROR_REVISION_CONFLICT) {
      const rejected = err.revisionConflict?.rejected ?? [];
      useUsersStore
        .getState()
        .jobData.actions.clearPendingJobDocumentWrites(queuedIds);
      showSnackbarWarning(revisionConflictMessage(rejected), 8);
      return "conflict";
    }
    console.error("Error saving job documents to API", err);
    return "failed";
  }
}

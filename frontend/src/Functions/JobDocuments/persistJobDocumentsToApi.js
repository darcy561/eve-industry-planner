import {
  putJobDocumentsBatch,
  putJobDocumentsChange,
} from "../Endpoints/Private/jobDocuments.js";
import { DOCUMENT_LOCK_CLIENT_ERROR_LOCK_HELD_ELSEWHERE } from "../DocumentLock/documentLockEvents.js";
import {
  CLIENT_ERROR_REVISION_CONFLICT,
  revisionConflictMessage,
} from "./revisionConflict.js";
import { showSnackbarWarning } from "../../Events/snackbarEvents.js";
import useUsersStore from "../../Zustand/usersStore.js";

/**
 * What a flush did, for a caller that has to tell a write that landed from one that was refused.
 *
 * @typedef {"saved" | "locked" | "conflict" | "failed"} JobDocumentPersistOutcome
 */

/**
 * The jobs a refused save had already written before the part that failed.
 *
 * @param {Error & {deliveredBatchItems?: Array<{jobID?: string}>}} err
 * @returns {Array<string>}
 */
function deliveredJobIDs(err) {
  return (err?.deliveredBatchItems ?? [])
    .map((job) => job?.jobID)
    .filter(Boolean);
}

/**
 * Persists dirty job documents (`PUT /api/v1/job-documents`) for the ids in
 * `pendingJobDocumentWrites`, warning the reader where a write is refused.
 *
 * @returns {Promise<JobDocumentPersistOutcome>}
 */
export async function persistJobDocumentsToApi() {
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

  try {
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
    if (err?.code === DOCUMENT_LOCK_CLIENT_ERROR_LOCK_HELD_ELSEWHERE) {
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
    if (err?.status === 400) {
      const { actions } = useUsersStore.getState().jobData;
      const wrote = deliveredJobIDs(err);
      if (wrote.length > 0) {
        actions.countWrittenJobRevisions(wrote);
      }
      actions.clearPendingJobDocumentWrites(queuedIds);
      console.error("Job documents were refused as unreadable", err);
      showSnackbarWarning(
        "Some changes could not be saved and have been discarded. Reload to continue from the saved version.",
        8,
      );
      return "failed";
    }
    console.error("Error saving job documents to API", err);
    return "failed";
  }
}

/**
 * Sends writes as one change and answers what it did; a refused change wrote none of its jobs, and
 * the reader is told why unless the review that follows a stale change does the telling.
 *
 * @param {Array<object>} writes - Envelopes from `jobWriteEnvelope`
 * @returns {Promise<JobDocumentPersistOutcome>}
 */
export async function persistJobChangeToApi(writes) {
  if (writes.length === 0) return "saved";

  try {
    await putJobDocumentsChange(writes);
    useUsersStore
      .getState()
      .jobData.actions.countWrittenJobRevisions(writes.map((w) => w.jobID));
    return "saved";
  } catch (err) {
    if (err?.code === CLIENT_ERROR_REVISION_CONFLICT) {
      return "conflict";
    }
    if (err?.code === DOCUMENT_LOCK_CLIENT_ERROR_LOCK_HELD_ELSEWHERE) {
      showSnackbarWarning(
        "Another member is editing a job this change touches, so none of it was saved. Your changes are still open.",
        8,
      );
      return "locked";
    }
    console.error("Job change was not saved", err);
    showSnackbarWarning(
      err?.status === 400
        ? "Some of your changes could not be read, so none of them were saved. Your changes are still open."
        : "Your changes could not be saved. They are still open, so you can try again.",
      8,
    );
    return "failed";
  }
}

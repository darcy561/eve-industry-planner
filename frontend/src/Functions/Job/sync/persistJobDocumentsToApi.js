import {
  putJobDocumentsBatch,
  putJobDocumentsChange,
} from "../../Endpoints/Private/jobDocuments.js";
import { DOCUMENT_LOCK_CLIENT_ERROR_LOCK_HELD_ELSEWHERE } from "../../DocumentLock/documentLockEvents.js";
import {
  CLIENT_ERROR_REVISION_CONFLICT,
  revisionConflictMessage,
} from "./revisionConflict.js";
import { showSnackbarWarning } from "../../../Events/snackbarEvents.js";
import { toDocument } from "../jobDocument.js";
import { requestJobDocumentsByIdsFromApi } from "../../Endpoints/Private/requestJobDocumentsByIds.js";
import useUsersStore from "../../../Zustand/usersStore.js";

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
 * The warning for queued changes another member's lock refused, which are put back as saved.
 *
 * @param {Array<string>} names - The held jobs, by name
 * @returns {string}
 */
function heldElsewhereMessage(names) {
  const listed = names.length > 0 ? names.join(", ") : "a job";
  return `Not saved: another member is editing ${listed}, so ${names.length === 1 ? "it shows" : "they show"} the saved version again.`;
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
      const wrote = [...deliveredJobIDs(err), ...(err.savedDocIDs ?? [])];
      const held = err.lockHeldDocIDs ?? [];
      const { actions } = useUsersStore.getState().jobData;
      if (wrote.length > 0) {
        actions.countWrittenJobRevisions(wrote);
        actions.clearPendingJobDocumentWrites(wrote);
      }
      if (held.length === 0) return "locked";
      const names = held.map(
        (jobID) => actions.findJobInJobArray(jobID)?.name || jobID,
      );
      actions.clearPendingJobDocumentWrites(held);
      if (document.visibilityState !== "hidden") {
        await restoreSavedJobs(held);
        showSnackbarWarning(heldElsewhereMessage(names), 8);
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
 * Sends writes and removals as one change and answers what it did; a refused change touched none of
 * its jobs, and the caller tells the reader why a stale or held change was refused.
 *
 * @param {Array<object>} writes - Envelopes from `jobWriteEnvelope`
 * @param {Array<{jobID: string, revision: number}>} [deletes]
 * @returns {Promise<JobDocumentPersistOutcome>}
 */
export async function persistJobChangeToApi(writes, deletes = []) {
  if (writes.length === 0 && deletes.length === 0) return "saved";

  try {
    await putJobDocumentsChange(writes, deletes);
    useUsersStore
      .getState()
      .jobData.actions.countWrittenJobRevisions(writes.map((w) => w.jobID));
    return "saved";
  } catch (err) {
    if (err?.code === CLIENT_ERROR_REVISION_CONFLICT) {
      return "conflict";
    }
    if (err?.code === DOCUMENT_LOCK_CLIENT_ERROR_LOCK_HELD_ELSEWHERE) {
      return "locked";
    }
    console.error("Job change was not saved", err);
    showSnackbarWarning(
      err?.status === 400
        ? "Some of the changes could not be read, so none of them were saved."
        : "The changes could not be saved. Try again.",
      8,
    );
    return "failed";
  }
}

/**
 * Puts the jobs a refused change touched back to their saved copies, in the planner and under the
 * editor, and takes out the new jobs it would have created.
 *
 * @param {Array<string>} jobIDs - Jobs that exist on the server
 * @param {Array<string>} [newJobIDs] - Jobs the refused change would have created
 */
export async function restoreSavedJobs(jobIDs, newJobIDs = []) {
  const { jobData, editSession } = useUsersStore.getState();
  if (newJobIDs.length > 0) {
    jobData.actions.removeJobsFromJobArray(newJobIDs);
  }
  let saved;
  try {
    saved = await requestJobDocumentsByIdsFromApi(jobIDs);
  } catch (err) {
    console.error(
      "Saved jobs could not be read back after a refused save",
      err,
    );
    showSnackbarWarning(
      "The saved jobs could not be read back. Reload before saving again.",
      8,
    );
    return;
  }
  const found = new Set(saved.map((job) => job.jobID));
  jobData.actions.updateOrAddJobsToJobArray(saved);
  const gone = jobIDs.filter((jobID) => !found.has(jobID));
  if (gone.length > 0) {
    jobData.actions.removeJobsFromJobArray(gone);
  }
  for (const job of saved) {
    editSession.actions.documentArrived(job.jobID, toDocument(job));
  }
}

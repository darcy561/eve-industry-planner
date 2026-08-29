import { putJobDocumentsBatch } from "../Endpoints/Private/jobDocuments.js";
import { DOCUMENT_LOCK_CLIENT_ERROR_LOCK_HELD_ELSEWHERE } from "../DocumentLock/documentLockEvents.js";
import useUsersStore from "../../Zustand/usersStore.js";

/**
 * Persists dirty job documents (`PUT /api/v1/job-documents`) for IDs in `pendingJobDocumentWrites`.
 */
export async function persistJobDocumentsToApi() {
  try {
    if (!useUsersStore.getState().account.isLoggedIn) {
      return;
    }

    const { jobData } = useUsersStore.getState();
    const { getPendingJobDocumentWritesPayload, clearPendingJobDocumentWrites } =
      jobData.actions;
    const queuedIds = [...new Set(jobData.pendingJobDocumentWrites ?? [])];
    if (queuedIds.length === 0) {
      return;
    }

    const jobs = getPendingJobDocumentWritesPayload();
    if (jobs.length === 0) {
      clearPendingJobDocumentWrites(queuedIds);
      return;
    }

    await putJobDocumentsBatch(jobs);
    clearPendingJobDocumentWrites(queuedIds);
  } catch (err) {
    if (err?.code === DOCUMENT_LOCK_CLIENT_ERROR_LOCK_HELD_ELSEWHERE) {
      return;
    }
    console.error("Error saving job documents to API", err);
  }
}

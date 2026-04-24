import { putJobDocumentsBatch } from "../Endpoints/Pirivate/jobDocuments.js";
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
    console.error("Error saving job documents to API", err);
  }
}

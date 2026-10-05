import { DOCUMENT_LOCK_CLIENT_ERROR_LOCK_HELD_ELSEWHERE } from "../../DocumentLock/documentLockEvents.js";
import { CLIENT_ERROR_REVISION_CONFLICT } from "../../Job/sync/revisionConflict.js";
import { toDocument } from "../../Job/jobDocument.js";
import requestWithPrivateHeaders, {
  privateBatchRetryConfig,
} from "./applyPrivateHeaders.js";

const ARCHIVED_JOBS_URL = "/api/v1/archived-jobs";

/**
 * Moves jobs off the planner into the archive in one request, which the server makes whole or
 * refuses whole.
 *
 * @param {Array<Object>} jobs - The jobs to archive, each carrying the revision it was read at
 * @returns {Promise<import("../../Job/sync/persistJobDocumentsToApi.js").JobDocumentPersistOutcome>}
 */
async function saveArchivedJobs(jobs) {
  if (!Array.isArray(jobs) || jobs.length === 0) return "saved";

  try {
    await requestWithPrivateHeaders(
      ARCHIVED_JOBS_URL,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobs: jobs.map((job) => toDocument(job)) }),
      },
      { requestName: "saveArchivedJobs", retry: privateBatchRetryConfig },
    );
    return "saved";
  } catch (error) {
    if (error?.code === DOCUMENT_LOCK_CLIENT_ERROR_LOCK_HELD_ELSEWHERE) {
      return "locked";
    }
    if (error?.code === CLIENT_ERROR_REVISION_CONFLICT) {
      return "conflict";
    }
    console.error("Error saving archived jobs:", error);
    return "failed";
  }
}

export default saveArchivedJobs;

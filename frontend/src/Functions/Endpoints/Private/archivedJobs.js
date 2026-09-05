import { DOCUMENT_LOCK_CLIENT_ERROR_LOCK_HELD_ELSEWHERE } from "../../DocumentLock/documentLockEvents.js";
import requestWithPrivateHeaders, {
  privateBatchRetryConfig,
} from "./applyPrivateHeaders.js";

const ARCHIVED_JOBS_URL = "/api/v1/archived-jobs";

/** Kept in sync with Go `PutArchivedJobsHandler` (`maxBatchSize`). */
const MAX_ARCHIVED_JOBS_BATCH = 100;

/**
 * Saves archived jobs to MongoDB via `PUT /api/v1/archived-jobs`.
 *
 * Body: `{ "jobs": [ … ] }`. Ownership is taken from the Bearer token (`account_id`); the
 * server sets `_meta.accountID` for each job (same as `PUT /api/v1/jobs`).
 *
 * @param {Array<Object>} jobs - `Job` instances from `job.js` (each must implement `toDocument()`)
 * @returns {Promise<boolean>} `true` on success. `false` if any batch failed (after `Promise.allSettled` in the private client) or the request threw. Batches use the same retry policy as other private `PUT` calls.
 */
async function saveArchivedJobs(jobs) {
  if (!jobs || !Array.isArray(jobs) || jobs.length === 0) {
    console.error("Invalid jobs array provided");
    return false;
  }

  const payloads = jobs.map((job) => job.toDocument());

  try {
    await requestWithPrivateHeaders(
      ARCHIVED_JOBS_URL,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ jobs: payloads }),
      },
      {
        requestName: "saveArchivedJobs",
        retry: privateBatchRetryConfig,
        batch: {
          size: MAX_ARCHIVED_JOBS_BATCH,
          arrayKey: "jobs",
          errorLabel: "PUT /api/v1/archived-jobs",
        },
      }
    );
    return true;
  } catch (error) {
    if (error?.code === DOCUMENT_LOCK_CLIENT_ERROR_LOCK_HELD_ELSEWHERE) {
      return false;
    }
    console.error("Error saving archived jobs:", error);
    return false;
  }
}

export default saveArchivedJobs;

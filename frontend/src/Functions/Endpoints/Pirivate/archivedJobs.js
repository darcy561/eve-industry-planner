import requestWithPrivateHeaders from "./applyPrivateHeaders.js";

const ARCHIVED_JOBS_URL = "/api/v1/archived-jobs";

/** Kept in sync with Go `PutArchivedJobsHandler` (`maxBatchSize`). */
const MAX_ARCHIVED_JOBS_BATCH = 100;

const MAX_CHUNK_ATTEMPTS = 3;
const CHUNK_RETRY_BASE_DELAY_MS = 350;

/**
 * @param {Array<Object>} chunk
 * @returns {Promise<Response>}
 */
function putArchivedJobsChunkWithRetry(chunk) {
  return requestWithPrivateHeaders(
    ARCHIVED_JOBS_URL,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ jobs: chunk }),
    },
    {
      requestName: "saveArchivedJobs",
      retry: {
        maxAttempts: MAX_CHUNK_ATTEMPTS,
        baseDelayMs: CHUNK_RETRY_BASE_DELAY_MS,
      },
    }
  );
}

/**
 * Saves archived jobs to MongoDB via `PUT /api/v1/archived-jobs`.
 *
 * Body: `{ "jobs": [ … ] }`. Ownership is taken from the Bearer token (`account_id`); the
 * server sets `_meta.accountID` for each job (same as `PUT /api/v1/jobs`).
 *
 * @param {Array<Object>} jobs - `Job` instances from `job.js` (each must implement `toDocument()`)
 * @returns {Promise<boolean>} `true` only if every batch succeeded; `false` if any batch failed (others still run via `Promise.allSettled`). Each batch is retried up to 3 times with linear backoff on network errors or **408 / 429 / 5xx** only. **401** (auth middleware), **403** (account mismatch), **405**, etc. are not retried.
 *
 * @example
 * const ok = await saveArchivedJobs([job]);
 */
async function saveArchivedJobs(jobs) {
  if (!jobs || !Array.isArray(jobs) || jobs.length === 0) {
    console.error("Invalid jobs array provided");
    return false;
  }

  const payloads = jobs.map((job) => job.toDocument());

  const chunks = [];
  for (let i = 0; i < payloads.length; i += MAX_ARCHIVED_JOBS_BATCH) {
    chunks.push(payloads.slice(i, i + MAX_ARCHIVED_JOBS_BATCH));
  }

  try {
    const settled = await Promise.allSettled(
      chunks.map((chunk) => putArchivedJobsChunkWithRetry(chunk))
    );

    let allSucceeded = true;
    for (let i = 0; i < settled.length; i++) {
      const result = settled[i];
      const label = `Archived jobs batch ${i + 1}/${settled.length}`;

      if (result.status === "rejected") {
        allSucceeded = false;
        const err = result.reason;
        if (err?.message?.includes("Authentication required")) {
          console.error(
            `${label}: authentication required (no server access token)`
          );
        } else {
          console.error(`${label}: request failed`, err);
        }
        continue;
      }

      const response = result.value;
      if (!response.ok) {
        allSucceeded = false;
        const errorText = await response.text();
        console.error(
          `${label}: ${response.status} ${response.statusText}`,
          errorText
        );
      }
    }

    return allSucceeded;
  } catch (error) {
    console.error("Error saving archived jobs:", error);
    return false;
  }
}

export default saveArchivedJobs;

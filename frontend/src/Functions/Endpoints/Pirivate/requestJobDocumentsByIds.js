/**
 * POST /api/v1/job-documents (batch by IDs) — HTTP only; no Zustand.
 * Use {@link fetchJobDocumentsByIdsFromApi} when the result should merge into the store.
 */
import Job from "../../../Classes/job.js";
import {
  requestWithPrivateHeaders,
  privateBatchRetryConfig,
} from "./applyPrivateHeaders.js";

const jsonHeaders = { "Content-Type": "application/json" };

/** Kept in sync with Go `GetJobDocumentsByIDsHandler` (`maxBatchSize`). */
const MAX_POST_JOB_DOCUMENTS_BY_IDS_BATCH = 200;

/**
 * @param {string[]} jobIDs
 * @returns {Promise<Job[]>}
 */
export async function requestJobDocumentsByIdsFromApi(jobIDs) {
  const ids = [...new Set((jobIDs ?? []).filter(Boolean))];
  if (ids.length === 0) return [];

  const res = await requestWithPrivateHeaders(
    "/api/v1/job-documents",
    {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ jobIDs: ids }),
    },
    {
      requestName: "getJobDocumentsByIds",
      retry: privateBatchRetryConfig,
      batch: {
        size: MAX_POST_JOB_DOCUMENTS_BY_IDS_BATCH,
        arrayKey: "jobIDs",
        mergeResponseJsonArrays: true,
        errorLabel: "POST /api/v1/job-documents",
      },
    }
  );

  const data = await res.json();
  const rows = Array.isArray(data) ? data : [];
  return rows.map((row) => new Job(row));
}

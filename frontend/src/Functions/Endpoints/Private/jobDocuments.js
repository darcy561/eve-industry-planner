import { jobFromDocument } from "../../JobDocuments/jobDocument.js";
import useUsersStore from "../../../Zustand/usersStore.js";
import {
  requestWithPrivateHeaders,
  privateBatchRetryConfig,
  throwNonOkPrivateResponse,
} from "./applyPrivateHeaders.js";
import { requestJobDocumentsByIdsFromApi } from "./requestJobDocumentsByIds.js";
import { activePlannerOwnerHandle } from "../../../Zustand/activePlanner/read.js";

/** The job documents collection, named as the change stream's `collection` field names it. */
export const USER_JOB_DOCUMENTS_COLLECTION = "job_documents";

const jsonHeaders = { "Content-Type": "application/json" };

/**
 * @param {Response} res
 * @param {string} label
 */
async function parseJsonBodyOrExplainHtml(res, label) {
  const text = await res.text();
  const trimmed = text.trim();
  if (trimmed.startsWith("<!DOCTYPE") || trimmed.startsWith("<html")) {
    throw new Error(
      `${label}: API returned HTML instead of JSON (${res.status}). Usually the dev proxy is not forwarding /api to the Go server, or the route is missing.`,
    );
  }
  try {
    return JSON.parse(text);
  } catch {
    const preview = trimmed.replace(/\s+/g, " ").slice(0, 120);
    throw new Error(
      `${label}: response is not valid JSON (${res.status}): ${preview}`,
    );
  }
}

/** Kept in sync with Go `PutJobDocumentsHandler` (`maxBatchSize`). */
const MAX_PUT_JOB_DOCUMENTS_BATCH = 100;

/** Kept in sync with Go `DeleteJobDocumentsHandler` (`maxBatchSize`). */
const MAX_DELETE_JOB_DOCUMENTS_BATCH = 200;

/**
 * Fetches the jobs carrying `displayOnPlanner: true`.
 *
 * @returns {Promise<object[]>}
 */
export async function fetchPlannerJobDocuments() {
  const url = new URL("/api/v1/job-documents/planner", window.location.origin);
  const res = await requestWithPrivateHeaders(
    url.toString(),
    { method: "GET" },
    {
      requestName: "getPlannerJobDocuments",
    },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `GET /api/v1/job-documents/planner failed: ${res.status} ${text || res.statusText}`,
    );
  }
  const data = await parseJsonBodyOrExplainHtml(
    res,
    "GET /api/v1/job-documents/planner",
  );
  const rows = Array.isArray(data) ? data : [];
  return rows.map((row) => jobFromDocument(row));
}

/**
 * Merges fetched planner jobs into `jobArray`, keeping a group's jobs while the
 * array still holds the same planner.
 *
 * @param {object[]} plannerJobs
 * @param {string} owner - the planner these jobs are for
 */
export function applyPlannerJobDocuments(plannerJobs, owner) {
  const { jobArray, owner: held } = useUsersStore.getState().jobData;
  const nonPlanner =
    held && held !== owner ? [] : jobArray.filter((j) => !j.displayOnPlanner);
  const mergedById = new Map(nonPlanner.map((j) => [j.jobID, j]));
  for (const j of plannerJobs) {
    mergedById.set(j.jobID, j);
  }
  useUsersStore
    .getState()
    .jobData.actions.replaceJobArray([...mergedById.values()], {
      fromServer: true,
      owner,
    });
}

/** Fetches the planner's jobs and merges them into `jobArray`. */
export async function fetchPlannerJobDocumentsFromApi() {
  const owner = activePlannerOwnerHandle();
  applyPlannerJobDocuments(await fetchPlannerJobDocuments(), owner);
}

/**
 * @param {string} groupID
 */
export async function fetchJobDocumentsByGroupFromApi(groupID) {
  const path = `/api/v1/job-documents/by-group/${encodeURIComponent(groupID)}`;
  const url = new URL(path, window.location.origin);
  const res = await requestWithPrivateHeaders(
    url.toString(),
    { method: "GET" },
    {
      requestName: "getJobDocumentsByGroup",
    },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `GET job-documents by-group failed: ${res.status} ${text || res.statusText}`,
    );
  }
  const data = await parseJsonBodyOrExplainHtml(
    res,
    "GET job-documents by-group",
  );
  const rows = Array.isArray(data) ? data : [];
  const jobs = rows.map((row) => jobFromDocument(row));
  useUsersStore.getState().jobData.actions.updateOrAddJobsToJobArray(jobs);
}

/**
 * @param {string} jobID
 * @returns {Promise<Job|null>}
 */
export async function fetchJobDocumentByIdFromApi(jobID) {
  const path = `/api/v1/job-documents/${encodeURIComponent(jobID)}`;
  const url = new URL(path, window.location.origin);
  const res = await requestWithPrivateHeaders(
    url.toString(),
    { method: "GET" },
    {
      requestName: "getJobDocumentById",
    },
  );
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `GET job-document failed: ${res.status} ${text || res.statusText}`,
    );
  }
  const row = await parseJsonBodyOrExplainHtml(res, "GET job-document");
  const job = jobFromDocument(row);
  useUsersStore.getState().jobData.actions.updateOrAddJobsToJobArray(job);
  return job;
}

/**
 * Batch fetch jobs by IDs (`POST /api/v1/job-documents`) and merge into `jobArray`.
 * For HTTP-only (no store), import from `./requestJobDocumentsByIds.js`.
 *
 * @param {string[]} jobIDs
 * @returns {Promise<Job[]>}
 */
export async function fetchJobDocumentsByIdsFromApi(jobIDs) {
  const jobs = await requestJobDocumentsByIdsFromApi(jobIDs);
  useUsersStore.getState().jobData.actions.updateOrAddJobsToJobArray(jobs);
  return jobs;
}

/**
 * Batch upsert (`PUT /api/v1/job-documents`), taking the envelopes
 * `jobWriteEnvelope` builds rather than bare job documents.
 *
 * @param {Array<object>} writes
 */
export async function putJobDocumentsBatch(writes) {
  if (writes.length === 0) return;

  await requestWithPrivateHeaders(
    "/api/v1/job-documents",
    {
      method: "PUT",
      headers: jsonHeaders,
      body: JSON.stringify({ jobs: writes }),
    },
    {
      requestName: "putJobDocuments",
      retry: privateBatchRetryConfig,
      batch: {
        size: MAX_PUT_JOB_DOCUMENTS_BATCH,
        arrayKey: "jobs",
        errorLabel: "PUT /api/v1/job-documents",
        failure: "first",
      },
    },
  );
}

/**
 * The body of a save whose writes land together or not at all.
 *
 * @param {Array<object>} writes - Envelopes from `jobWriteEnvelope`
 * @returns {{jobs: Array<object>, oneChange: true}}
 */
export function jobChangeRequestBody(writes) {
  return { jobs: writes, oneChange: true };
}

/**
 * Sends writes as one change in a single request, which the server writes whole or refuses whole.
 *
 * @param {Array<object>} writes - Envelopes from `jobWriteEnvelope`
 */
export async function putJobDocumentsChange(writes) {
  if (writes.length === 0) return;

  const res = await requestWithPrivateHeaders(
    "/api/v1/job-documents",
    {
      method: "PUT",
      headers: jsonHeaders,
      body: JSON.stringify(jobChangeRequestBody(writes)),
    },
    {
      requestName: "putJobDocumentsChange",
      retry: privateBatchRetryConfig,
    },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throwNonOkPrivateResponse(res, "PUT", "/api/v1/job-documents", text);
  }
}

/**
 * @param {string[]} jobIDs
 */
export async function deleteJobDocumentsFromApi(jobIDs) {
  const ids = [...new Set(jobIDs.filter(Boolean))];
  if (ids.length === 0) return;

  await requestWithPrivateHeaders(
    "/api/v1/job-documents",
    {
      method: "DELETE",
      headers: jsonHeaders,
      body: JSON.stringify({ jobIDs: ids }),
    },
    {
      requestName: "deleteJobDocuments",
      retry: privateBatchRetryConfig,
      batch: {
        size: MAX_DELETE_JOB_DOCUMENTS_BATCH,
        arrayKey: "jobIDs",
        errorLabel: "DELETE /api/v1/job-documents",
      },
    },
  );
}

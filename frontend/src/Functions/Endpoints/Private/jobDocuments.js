/**
 * User job documents: `account_job_documents` collection (private API).
 * Must match `mongocore.CollectionUserJobDocuments` / changestream `collection` field.
 */
import Job from "../../../Classes/job.js";
import useUsersStore from "../../../Zustand/usersStore.js";
import {
  requestWithPrivateHeaders,
  privateBatchRetryConfig,
} from "./applyPrivateHeaders.js";
import { requestJobDocumentsByIdsFromApi } from "./requestJobDocumentsByIds.js";

export const USER_JOB_DOCUMENTS_COLLECTION = "account_job_documents";

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
      `${label}: API returned HTML instead of JSON (${res.status}). Usually the dev proxy is not forwarding /api to the Go server, or the route is missing.`
    );
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    const preview = trimmed.replace(/\s+/g, " ").slice(0, 120);
    throw new Error(
      `${label}: response is not valid JSON (${res.status}): ${preview}`
    );
  }
}

/** Kept in sync with Go `PutJobDocumentsHandler` (`maxBatchSize`). */
const MAX_PUT_JOB_DOCUMENTS_BATCH = 100;

/** Kept in sync with Go `DeleteJobDocumentsHandler` (`maxBatchSize`). */
const MAX_DELETE_JOB_DOCUMENTS_BATCH = 200;

/**
 * Fetches jobs with `displayOnPlanner: true` and merges into `jobArray` (planner + login bootstrap).
 */
export async function fetchPlannerJobDocumentsFromApi() {
  const url = new URL("/api/v1/job-documents/planner", window.location.origin);
  const res = await requestWithPrivateHeaders(url.toString(), { method: "GET" }, {
    requestName: "getPlannerJobDocuments",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `GET /api/v1/job-documents/planner failed: ${res.status} ${text || res.statusText}`
    );
  }
  const data = await res.json();
  const rows = Array.isArray(data) ? data : [];
  const plannerJobs = rows.map((row) => new Job(row));
  const prev = useUsersStore.getState().jobData.jobArray;
  const nonPlanner = prev.filter((j) => !j.displayOnPlanner);
  const mergedById = new Map(nonPlanner.map((j) => [j.jobID, j]));
  for (const j of plannerJobs) {
    mergedById.set(j.jobID, j);
  }
  useUsersStore
    .getState()
    .jobData.actions.replaceJobArray([...mergedById.values()], { fromServer: true });
}

/**
 * @param {string} groupID
 */
export async function fetchJobDocumentsByGroupFromApi(groupID) {
  const path = `/api/v1/job-documents/by-group/${encodeURIComponent(groupID)}`;
  const url = new URL(path, window.location.origin);
  const res = await requestWithPrivateHeaders(url.toString(), { method: "GET" }, {
    requestName: "getJobDocumentsByGroup",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `GET job-documents by-group failed: ${res.status} ${text || res.statusText}`
    );
  }
  const data = await res.json();
  const rows = Array.isArray(data) ? data : [];
  const jobs = rows.map((row) => new Job(row));
  useUsersStore.getState().jobData.actions.updateOrAddJobsToJobArray(jobs);
}

/**
 * @param {string} jobID
 * @returns {Promise<Job|null>}
 */
export async function fetchJobDocumentByIdFromApi(jobID) {
  const path = `/api/v1/job-documents/${encodeURIComponent(jobID)}`;
  const url = new URL(path, window.location.origin);
  const res = await requestWithPrivateHeaders(url.toString(), { method: "GET" }, {
    requestName: "getJobDocumentById",
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `GET job-document failed: ${res.status} ${text || res.statusText}`
    );
  }
  const row = await res.json();
  const job = new Job(row);
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
 * Batch upsert (`PUT /api/v1/job-documents`).
 * @param {Array<Job|object>} jobs - Plain or Job instances (serialised as JSON)
 */
export async function putJobDocumentsBatch(jobs) {
  const payload = jobs.map((j) => (typeof j.toDocument === "function" ? j.toDocument() : j));
  if (payload.length === 0) return;

  await requestWithPrivateHeaders(
    "/api/v1/job-documents",
    {
      method: "PUT",
      headers: jsonHeaders,
      body: JSON.stringify({ jobs: payload }),
    },
    {
      requestName: "putJobDocuments",
      retry: privateBatchRetryConfig,
      batch: {
        size: MAX_PUT_JOB_DOCUMENTS_BATCH,
        arrayKey: "jobs",
        errorLabel: "PUT /api/v1/job-documents",
      },
    }
  );
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
    }
  );
}

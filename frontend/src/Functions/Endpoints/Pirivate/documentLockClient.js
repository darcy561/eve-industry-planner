import {
  isRealtimeSocketOpen,
  requestDocumentLockStatusBatchOverRealtime,
} from "../../../Realtime/realtimeClient.js";
import { requestWithPrivateHeaders } from "./applyPrivateHeaders.js";
import {
  USER_JOBS_COLLECTION,
  USER_JOB_GROUPS_COLLECTION,
} from "../../DocumentLock/documentLockCollections.js";

/** Kept in sync with `documentlocks.MaxStatusBatchDocs` (`status_batch.go`). */
export const MAX_STATUS_BATCH_DOC_IDS = 500;

const STATUS_BATCH_HTTP_URL = new URL(
  `/api/v1/document-locks/status-batch`,
  window.location.origin
).toString();

/**
 * @param {unknown} arr
 * @returns {string[]}
 */
function normalizeDocIdList(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.filter((id) => typeof id === "string" && id.trim() !== "");
}

/**
 * POST `/status-batch` in chunks so each of `jobDocIDs` and `groupDocIDs` stays ≤ {@link MAX_STATUS_BATCH_DOC_IDS}.
 *
 * @param {string[]} jobsNorm
 * @param {string[]} groupsNorm
 * @returns {Promise<Response>}
 */
async function mergeLockStatusBatchOverHttp(jobsNorm, groupsNorm) {
  let jobs = [...jobsNorm];
  let groups = [...groupsNorm];
  const mergedJob = {};
  const mergedGroup = {};

  while (jobs.length > 0 || groups.length > 0) {
    const jobChunk = jobs.splice(0, MAX_STATUS_BATCH_DOC_IDS);
    const groupChunk = groups.splice(0, MAX_STATUS_BATCH_DOC_IDS);
    const res = await requestWithPrivateHeaders(
      STATUS_BATCH_HTTP_URL,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobDocIDs: jobChunk,
          groupDocIDs: groupChunk,
        }),
      },
      { requestName: "documentLockStatusBatch", retry: false }
    );
    if (!res.ok) return res;
    const body = await res.json().catch(() => ({}));
    if (body.jobResults && typeof body.jobResults === "object") {
      Object.assign(mergedJob, body.jobResults);
    }
    if (body.groupResults && typeof body.groupResults === "object") {
      Object.assign(mergedGroup, body.groupResults);
    }
  }

  return new Response(
    JSON.stringify({ jobResults: mergedJob, groupResults: mergedGroup }),
    {
      status: 200,
      statusText: "OK",
      headers: { "Content-Type": "application/json" },
    }
  );
}

/**
 * Same chunking as HTTP; merges WS payloads into one logical result.
 *
 * @param {string[]} jobsNorm
 * @param {string[]} groupsNorm
 */
async function mergeLockStatusBatchOverWs(jobsNorm, groupsNorm) {
  let jobs = [...jobsNorm];
  let groups = [...groupsNorm];
  const mergedJob = {};
  const mergedGroup = {};

  while (jobs.length > 0 || groups.length > 0) {
    const jobChunk = jobs.splice(0, MAX_STATUS_BATCH_DOC_IDS);
    const groupChunk = groups.splice(0, MAX_STATUS_BATCH_DOC_IDS);
    const { jobResults, groupResults } =
      await requestDocumentLockStatusBatchOverRealtime({
        jobDocIDs: jobChunk,
        groupDocIDs: groupChunk,
      });
    Object.assign(mergedJob, jobResults);
    Object.assign(mergedGroup, groupResults);
  }
  return { jobResults: mergedJob, groupResults: mergedGroup };
}

function lockUrl(action) {
  return new URL(`/api/v1/document-locks/${action}`, window.location.origin).toString();
}

/**
 * @param {string} collection
 * @param {string} docID
 * @returns {Promise<Response>}
 */
export function acquireDocumentLock(collection, docID) {
  return requestWithPrivateHeaders(
    lockUrl("acquire"),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ collection, docID }),
    },
    { requestName: "documentLockAcquire", retry: false }
  );
}

/**
 * @param {string} collection
 * @param {string} docID
 * @returns {Promise<Response>}
 */
export function extendDocumentLock(collection, docID) {
  return requestWithPrivateHeaders(
    lockUrl("extend"),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ collection, docID }),
    },
    { requestName: "documentLockExtend", retry: false }
  );
}

/**
 * @param {string} collection
 * @param {string} docID
 * @returns {Promise<Response>}
 */
export function releaseDocumentLock(collection, docID) {
  return requestWithPrivateHeaders(
    lockUrl("release"),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ collection, docID }),
    },
    { requestName: "documentLockRelease", retry: false }
  );
}

/**
 * Holder accepts another session's access request. Server-side this atomically
 * transfers ownership to the alive head of the waitlist (same transition as a
 * post-probe handoff) so the lock cannot leak to a neutral state where any
 * session could race in. Falls back to a plain release with no recipient when
 * the requester is no longer alive in the queue.
 *
 * @param {string} collection
 * @param {string} docID
 * @returns {Promise<Response>}
 */
export function handOverDocumentLock(collection, docID) {
  return requestWithPrivateHeaders(
    lockUrl("hand-over"),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ collection, docID }),
    },
    { requestName: "documentLockHandOver", retry: false }
  );
}

/**
 * @param {string} collection
 * @param {string} docID
 * @returns {Promise<Response>}
 */
export function requestDocumentLockAccess(collection, docID) {
  return requestWithPrivateHeaders(
    lockUrl("request"),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ collection, docID }),
    },
    { requestName: "documentLockRequest", retry: false }
  );
}

/**
 * @param {string} collection
 * @param {string} docID
 * @returns {Promise<Response>}
 */
export async function getDocumentLockStatus(collection, docID) {
  if (collection === USER_JOBS_COLLECTION) {
    return getDocumentLockStatusBatch({
      jobDocIDs: [docID],
      groupDocIDs: [],
    }).then((res) => wrapBatchSinglePayload(res, "job", docID));
  }
  if (collection === USER_JOB_GROUPS_COLLECTION) {
    return getDocumentLockStatusBatch({
      jobDocIDs: [],
      groupDocIDs: [docID],
    }).then((res) => wrapBatchSinglePayload(res, "group", docID));
  }
  const url = new URL(`/api/v1/document-locks/status`, window.location.origin);
  url.searchParams.set("collection", collection);
  url.searchParams.set("docID", docID);
  return requestWithPrivateHeaders(
    url.toString(),
    { method: "GET" },
    { requestName: "documentLockStatus", retry: false }
  );
}

/**
 * @param {Response} res
 * @param {"job"|"group"} kind
 * @param {string} docID
 */
async function wrapBatchSinglePayload(res, kind, docID) {
  if (!res.ok) return res;
  const body = await res.json().catch(() => ({}));
  const map =
    kind === "job"
      ? body.jobResults && typeof body.jobResults === "object"
        ? body.jobResults
        : {}
      : body.groupResults && typeof body.groupResults === "object"
        ? body.groupResults
        : {};
  const payload = map[docID] && typeof map[docID] === "object" ? map[docID] : {};
  return new Response(JSON.stringify(payload), {
    status: res.status,
    statusText: res.statusText,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Fetch lock status for jobs and/or groups in one request (avoids per-doc rate limiting).
 * Uses WebSocket when `/ws` is connected (same Redis rows as HTTP); falls back to POST `/status-batch`.
 *
 * @param {{ jobDocIDs?: string[], groupDocIDs?: string[] }} params
 * @returns {Promise<Response>} JSON `{ jobResults, groupResults }` — maps of docID → status payload
 */
export async function getDocumentLockStatusBatch({
  jobDocIDs = [],
  groupDocIDs = [],
} = {}) {
  const jobs = normalizeDocIdList(jobDocIDs);
  const groups = normalizeDocIdList(groupDocIDs);

  if (jobs.length === 0 && groups.length === 0) {
    return new Response(
      JSON.stringify({ jobResults: {}, groupResults: {} }),
      {
        status: 200,
        statusText: "OK",
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  if (isRealtimeSocketOpen()) {
    try {
      const { jobResults, groupResults } = await mergeLockStatusBatchOverWs(
        jobs,
        groups
      );
      return new Response(JSON.stringify({ jobResults, groupResults }), {
        status: 200,
        statusText: "OK",
        headers: { "Content-Type": "application/json" },
      });
    } catch {
      /* fall through to HTTP */
    }
  }
  return mergeLockStatusBatchOverHttp(jobs, groups);
}

/**
 * Confirms the queued session is present after {@link document_lock_handoff_probe} (called automatically from the client).
 *
 * @param {string} collection
 * @param {string} docID
 * @returns {Promise<Response>}
 */
export function claimDocumentLockHandoff(collection, docID) {
  return requestWithPrivateHeaders(
    lockUrl("claim-handoff"),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ collection, docID }),
    },
    { requestName: "documentLockClaimHandoff", retry: false }
  );
}

/**
 * Refresh waitlist presence while queued (see server waitlist pulse TTL).
 *
 * @param {string} collection
 * @param {string} docID
 * @returns {Promise<Response>}
 */
export function pulseDocumentLockWaitlist(collection, docID) {
  return requestWithPrivateHeaders(
    lockUrl("waitlist-pulse"),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ collection, docID }),
    },
    { requestName: "documentLockWaitlistPulse", retry: false }
  );
}

/**
 * Announce this tab as a passive viewer of `(collection, docID)`. Triggers a
 * `document_lock_viewer_joined` event on the server so the current lock holder sees
 * the contention affordance even without an explicit Request access click.
 *
 * @param {string} collection
 * @param {string} docID
 * @returns {Promise<Response>}
 */
export function postDocumentLockViewerArrived(collection, docID) {
  return requestWithPrivateHeaders(
    lockUrl("viewer-arrived"),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ collection, docID }),
    },
    { requestName: "documentLockViewerArrived", retry: false }
  );
}

/**
 * Clear this tab's viewer-presence entry on the server. Triggers a
 * `document_lock_viewer_left` event so the holder's icon updates promptly instead
 * of waiting for the server-side `ViewerPresenceTTL` defensive sweep.
 *
 * @param {string} collection
 * @param {string} docID
 * @returns {Promise<Response>}
 */
export function postDocumentLockViewerDeparted(collection, docID) {
  return requestWithPrivateHeaders(
    lockUrl("viewer-departed"),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ collection, docID }),
    },
    { requestName: "documentLockViewerDeparted", retry: false }
  );
}

/**
 * Best-effort viewer-departed via `navigator.sendBeacon` so the request still leaves
 * the browser during `pagehide` / `beforeunload`. Falls back to the fetch-based path
 * when sendBeacon is unavailable. Body matches the `/viewer-departed` endpoint.
 *
 * @param {string} collection
 * @param {string} docID
 * @returns {boolean} true when a beacon was queued, false to indicate caller should fall back
 */
export function sendDocumentLockViewerDepartedBeacon(collection, docID) {
  if (
    typeof navigator === "undefined" ||
    typeof navigator.sendBeacon !== "function" ||
    !collection ||
    !docID
  ) {
    return false;
  }
  try {
    const blob = new Blob([JSON.stringify({ collection, docID })], {
      type: "application/json",
    });
    return navigator.sendBeacon(lockUrl("viewer-departed"), blob);
  } catch {
    return false;
  }
}

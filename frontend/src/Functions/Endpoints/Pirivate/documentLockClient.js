import {
  isRealtimeSocketOpen,
  requestDocumentLockStatusBatchOverRealtime,
} from "../../../Realtime/realtimeClient.js";
import { requestWithPrivateHeaders } from "./applyPrivateHeaders.js";
import {
  USER_JOBS_COLLECTION,
  USER_JOB_GROUPS_COLLECTION,
} from "../../DocumentLock/documentLockCollections.js";

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
  if (isRealtimeSocketOpen()) {
    try {
      const { jobResults, groupResults } =
        await requestDocumentLockStatusBatchOverRealtime({
          jobDocIDs,
          groupDocIDs,
        });
      return new Response(JSON.stringify({ jobResults, groupResults }), {
        status: 200,
        statusText: "OK",
        headers: { "Content-Type": "application/json" },
      });
    } catch {
      /* fall through to HTTP */
    }
  }
  return requestWithPrivateHeaders(
    new URL(`/api/v1/document-locks/status-batch`, window.location.origin).toString(),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobDocIDs, groupDocIDs }),
    },
    { requestName: "documentLockStatusBatch", retry: false }
  );
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

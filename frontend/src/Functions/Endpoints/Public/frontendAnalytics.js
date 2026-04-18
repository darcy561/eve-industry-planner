import { fetchWithPublicHeaders } from "./applyPublicHeaders.js";
import {
  MAX_FRONTEND_ANALYTICS_BY_TYPE_KEYS,
  MAX_FRONTEND_ANALYTICS_EVENT_COUNT,
} from "./apiLimits.js";
import useUserStore from "../../../Zustand/usersStore";

/** Path for POST body `{ event, count? }` — server allowlist and OTel metrics. */
export const FRONTEND_ANALYTICS_EVENT_URL = "/api/v1/analytics/event";

const NEW_JOB_EVENT = "new_job";

/** Matches `MaxFrontendJobCreatesPerType` in services/shared/telemetry/apimetrics/frontend_events.go */
const MAX_JOBS_PER_TYPE_IN_PAYLOAD = 100000;

/**
 * @param {Record<string, number> | undefined} byType
 * @returns {Record<string, number> | null}
 */
function sanitizeByTypeMap(byType) {
  if (!byType || typeof byType !== "object" || Array.isArray(byType)) {
    return null;
  }
  const out = {};
  for (const [k, v] of Object.entries(byType)) {
    const typeId = Math.floor(Number(k));
    const n = Math.floor(Number(v));
    if (!Number.isFinite(typeId) || typeId < 1) {
      continue;
    }
    if (!Number.isFinite(n) || n < 1) {
      continue;
    }
    const key = String(typeId);
    const add = Math.min(MAX_JOBS_PER_TYPE_IN_PAYLOAD, n);
    out[key] = Math.min(
      MAX_JOBS_PER_TYPE_IN_PAYLOAD,
      (out[key] || 0) + add
    );
  }
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * @param {Record<string, number>} obj
 * @returns {Record<string, number>[]}
 */
function chunkByTypeObject(obj, chunkSize) {
  const entries = Object.entries(obj);
  const chunks = [];
  for (let i = 0; i < entries.length; i += chunkSize) {
    chunks.push(Object.fromEntries(entries.slice(i, i + chunkSize)));
  }
  return chunks;
}

async function postAnalyticsBody(body) {
  let serverToken = null;
  try {
    serverToken = useUserStore.getState().account.actions.getServerAccessToken();
  } catch {
    // logged out or store unavailable
  }

  const options = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
  if (serverToken) {
    options.headers.Authorization = `Bearer ${serverToken}`;
  }

  const response = await fetchWithPublicHeaders(
    FRONTEND_ANALYTICS_EVENT_URL,
    options,
    {
      requestName: "submitFrontendAnalyticsEvent",
    }
  );
  return response.ok;
}

/**
 * Submits one product event for server-side OTel metrics (no per-user payload in the body).
 * Uses public headers; optional Bearer JWT when logged in (audience label only on server).
 *
 * Retries: enabled via default `withRequestRetries` policy in `fetchWithPublicHeaders`.
 *
 * @param {string} eventKey - Allowlisted snake_case event name
 * @param {number} [count=1] - Metric increment, clamped to 1..MAX_FRONTEND_ANALYTICS_EVENT_COUNT (ignored for `new_job`)
 * @param {{ byType?: Record<string, number> }} [options] - For `new_job` only: `{ byType: { "1206": 3 } }` (string keys = type IDs)
 * @returns {Promise<boolean>} true if every request completed with a successful HTTP status
 */
export async function submitFrontendAnalyticsEvent(
  eventKey,
  count = 1,
  options = {}
) {
  if (typeof eventKey !== "string" || !eventKey.trim()) {
    return false;
  }

  const trimmed = eventKey.trim();

  if (trimmed === NEW_JOB_EVENT) {
    const byType = sanitizeByTypeMap(options.byType);
    if (!byType) {
      return false;
    }
    const chunks = chunkByTypeObject(byType, MAX_FRONTEND_ANALYTICS_BY_TYPE_KEYS);
    let ok = true;
    for (const chunk of chunks) {
      try {
        ok = ok && (await postAnalyticsBody({ event: trimmed, by_type: chunk }));
      } catch {
        ok = false;
      }
    }
    return ok;
  }

  const body = { event: trimmed };
  if (typeof count === "number" && Number.isFinite(count) && count !== 1) {
    body.count = Math.min(
      MAX_FRONTEND_ANALYTICS_EVENT_COUNT,
      Math.max(1, Math.floor(count))
    );
  }

  try {
    return await postAnalyticsBody(body);
  } catch {
    return false;
  }
}

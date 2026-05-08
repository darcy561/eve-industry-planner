import { fetchWithPublicHeaders } from "./applyPublicHeaders.js";
import {
  MAX_FRONTEND_ANALYTICS_BATCH_EVENTS,
  MAX_FRONTEND_ANALYTICS_BY_TYPE_KEYS,
  MAX_FRONTEND_ANALYTICS_EVENT_COUNT,
} from "./apiLimits.js";

/** Batched analytics only; server no longer exposes a single-event route. */
export const FRONTEND_ANALYTICS_EVENTS_BATCH_URL = "/api/v1/analytics/events";

const NEW_JOB_EVENT = "new_job";
const ITEM_TREE_VIEW_ITEM_EVENT = "view_item_tree_item";

/** Matches `MaxFrontendJobCreatesPerType` in services/shared/telemetry/apimetrics/frontend_events.go */
const MAX_JOBS_PER_TYPE_IN_PAYLOAD = 100000;

/** Debounce after last enqueue before flushing to the API. */
const FLUSH_DEBOUNCE_MS = 2500;

/** Force a flush if the oldest queued item has waited this long (background tabs). */
const FLUSH_MAX_WAIT_MS = 12000;

/** Approximate queue weight (simple events + new_job type keys) to flush without waiting full debounce. */
const FLUSH_IMMEDIATE_WEIGHT = 48;

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
 * @param {number} chunkSize
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

function getAuthHeadersBase() {
  const options = {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
  };
  return options;
}

/**
 * @param {unknown} body
 * @param {{ keepalive?: boolean, requestName: string }} opts - `keepalive` and default retries can both be set; each retry issues a new fetch with the same options.
 */
async function postAnalyticsBatchRequest(body, opts) {
  const base = getAuthHeadersBase();
  const response = await fetchWithPublicHeaders(
    FRONTEND_ANALYTICS_EVENTS_BATCH_URL,
    {
      ...base,
      body: JSON.stringify(body),
      keepalive: !!opts.keepalive,
    },
    {
      requestName: opts.requestName,
      batch: {
        size: MAX_FRONTEND_ANALYTICS_BATCH_EVENTS,
        arrayKey: "events",
      },
    }
  );
  return response.ok;
}

/**
 * Best-effort flush for page lifecycle: `keepalive: true` so the browser may still send
 * the request as the page goes away, plus default public-fetch retries (408/429/5xx) on
 * each attempt. Fire-and-forget — unload may end before all retries finish.
 * @param {unknown} body
 */
function postAnalyticsBatchRequestSync(body) {
  const base = getAuthHeadersBase();
  try {
    void fetchWithPublicHeaders(
      FRONTEND_ANALYTICS_EVENTS_BATCH_URL,
      {
        ...base,
        body: JSON.stringify(body),
        keepalive: true,
      },
      {
        requestName: "submitFrontendAnalyticsBatchUnload",
        batch: {
          size: MAX_FRONTEND_ANALYTICS_BATCH_EVENTS,
          arrayKey: "events",
        },
      }
    );
  } catch {
    /* ignore */
  }
}

/** @typedef {{ simple: Map<string, number>, newJobByType: Record<string, number> | null }} PendingState */

/** @type {PendingState} */
let pending = { simple: new Map(), newJobByType: null };

/** @type {ReturnType<typeof setTimeout> | null} */
let flushTimer = null;

/** @type {number | null} */
let queueSince = null;

/** @type {Promise<void> | null} */
let flushChain = Promise.resolve();

function newEmptyPending() {
  return { simple: new Map(), newJobByType: null };
}

function swapPending() {
  const cur = pending;
  pending = newEmptyPending();
  queueSince = null;
  if (flushTimer != null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  return cur;
}

function mergeIntoPending(eventKey, count, options) {
  const trimmed = eventKey.trim();
  if (trimmed === NEW_JOB_EVENT || trimmed === ITEM_TREE_VIEW_ITEM_EVENT) {
    const byType = sanitizeByTypeMap(options.byType);
    if (!byType) {
      return false;
    }
    if (!pending.newJobByType) {
      pending.newJobByType = {};
    }
    const acc = pending.newJobByType;
    for (const [k, v] of Object.entries(byType)) {
      acc[k] = Math.min(
        MAX_JOBS_PER_TYPE_IN_PAYLOAD,
        (acc[k] || 0) + Math.floor(v)
      );
    }
    return true;
  }

  const n = Math.min(
    MAX_FRONTEND_ANALYTICS_EVENT_COUNT,
    Math.max(1, Math.floor(Number(count)) || 1)
  );
  pending.simple.set(
    trimmed,
    Math.min(
      MAX_FRONTEND_ANALYTICS_EVENT_COUNT,
      (pending.simple.get(trimmed) || 0) + n
    )
  );
  return true;
}

function approximateQueueWeight() {
  const njKeys = pending.newJobByType
    ? Object.keys(pending.newJobByType).length
    : 0;
  return pending.simple.size + njKeys;
}

/**
 * @param {PendingState} merged
 * @returns {{ events: object[] }}
 */
function buildAnalyticsRequestBody(merged) {
  /** @type {object[]} */
  const events = [];
  for (const [event, count] of merged.simple) {
    const o = { event };
    if (count !== 1) {
      o.count = count;
    }
    events.push(o);
  }
  if (merged.newJobByType && Object.keys(merged.newJobByType).length > 0) {
    const chunks = chunkByTypeObject(
      merged.newJobByType,
      MAX_FRONTEND_ANALYTICS_BY_TYPE_KEYS
    );
    for (const chunk of chunks) {
      events.push({ event: NEW_JOB_EVENT, by_type: chunk });
    }
  }
  return { events };
}

async function flushMergedState(merged) {
  const body = buildAnalyticsRequestBody(merged);
  if (body.events.length === 0) {
    return true;
  }
  try {
    return await postAnalyticsBatchRequest(body, {
      requestName: "submitFrontendAnalyticsBatch",
    });
  } catch {
    return false;
  }
}

function scheduleFlush() {
  if (queueSince == null) {
    queueSince = Date.now();
  }
  if (flushTimer != null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }

  const waited = Date.now() - queueSince;
  const maxWaitElapsed = waited >= FLUSH_MAX_WAIT_MS;
  const heavy = approximateQueueWeight() >= FLUSH_IMMEDIATE_WEIGHT;

  if (maxWaitElapsed || heavy) {
    flushChain = flushChain.then(() => runFlush().catch(() => {}));
    return;
  }

  flushTimer = window.setTimeout(() => {
    flushTimer = null;
    queueSince = null;
    flushChain = flushChain.then(() => runFlush().catch(() => {}));
  }, FLUSH_DEBOUNCE_MS);
}

async function runFlush() {
  const merged = swapPending();
  if (
    merged.simple.size === 0 &&
    (!merged.newJobByType || Object.keys(merged.newJobByType).length === 0)
  ) {
    return;
  }
  await flushMergedState(merged);
}

/**
 * Drains the queue synchronously (pagehide). Best-effort; drops on failure.
 */
export function flushFrontendAnalyticsQueueForUnload() {
  const merged = swapPending();
  if (
    merged.simple.size === 0 &&
    (!merged.newJobByType || Object.keys(merged.newJobByType).length === 0)
  ) {
    return;
  }
  const body = buildAnalyticsRequestBody(merged);
  if (body.events.length > 0) {
    postAnalyticsBatchRequestSync(body);
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => {
    flushFrontendAnalyticsQueueForUnload();
  });
}

/**
 * Submits one product event for server-side OTel metrics (debounced + batched with other events).
 *
 * @param {string} eventKey - Allowlisted snake_case event name
 * @param {number} [count=1] - Metric increment, clamped (ignored for `new_job`)
 * @param {{ byType?: Record<string, number> }} [options] - For `new_job` and `view_item_tree_item`
 * @returns {Promise<boolean>} true if accepted into the outbound queue (or flushed for sync path); false if rejected before queue (e.g. bad new_job payload)
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

  if (trimmed === NEW_JOB_EVENT || trimmed === ITEM_TREE_VIEW_ITEM_EVENT) {
    const byType = sanitizeByTypeMap(options.byType);
    if (!byType) {
      return false;
    }
  }

  if (!mergeIntoPending(trimmed, count, options)) {
    return false;
  }

  scheduleFlush();
  return true;
}

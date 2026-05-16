import useUserStore from "../../../Zustand/usersStore";
import { chunkArray } from "../chunkArray.js";
import withRequestRetries, { splitRetryConfig } from "../withRequestRetries.js";
import { getRealtimeClientID } from "../../../Realtime/wsClientIdentity.js";
import { applyLockHeldElsewhereFromApiBody } from "../../DocumentLock/applyLockHeldElsewhereFromApiResponse.js";
import { DOCUMENT_LOCK_CLIENT_ERROR_LOCK_HELD_ELSEWHERE } from "../../DocumentLock/documentLockEvents.js";

/**
 * Shared `retry` options for batched private calls (same as `withRequestRetries` defaults).
 */
export const privateBatchRetryConfig = Object.freeze({
  maxAttempts: 3,
  baseDelayMs: 350,
});

/**
 * After `Promise.allSettled`, throw if any chunk rejected (e.g. HTTP error after retries).
 *
 * @param {PromiseSettledResult<unknown>[]} settled
 * @param {string} label
 */
function throwIfAnySettledFailed(settled, label) {
  const failed = settled.filter((s) => s.status === "rejected");
  if (failed.length === 0) return;
  const err = /** @type {PromiseRejectedResult} */ (failed[0]).reason;
  const msg = err instanceof Error ? err.message : String(err);
  throw new Error(
    `${label}: ${failed.length}/${settled.length} batch(es) failed — ${msg}`
  );
}

/**
 * @param {Response} res
 * @param {string} methodLabel
 * @param {string} url
 * @param {string} text
 * @param {string} [errorLabel]
 * @returns {never}
 */
function throwNonOkPrivateResponse(res, methodLabel, url, text, errorLabel) {
  if (res.status === 409 && applyLockHeldElsewhereFromApiBody(text)) {
    const label = errorLabel || `${methodLabel} ${url}`;
    const err = new Error(`${label}: document lock held elsewhere (409)`);
    err.code = LOCK_HELD_ELSEWHERE;
    throw err;
  }
  const err = new Error(
    `${methodLabel} ${url} failed: ${res.status} ${text || res.statusText}`
  );
  err.status = res.status;
  throw err;
}

/**
 * Thrown / rejected when no authenticated app session is available for a private request (not retried).
 * @type {string}
 */
export const PRIVATE_AUTH_TOKEN_UNAVAILABLE =
  "Authentication required but no session available";

/**
 * @typedef {object} PrivateRequestBatchOptions
 * @property {number} size - Max items per HTTP request; must be >= 1.
 * @property {string} arrayKey - JSON body property holding the array to split (`jobIDs`, `jobs`, …).
 * @property {boolean} [mergeResponseJsonArrays] - If true, each response body must be a JSON array; merged in chunk order into one synthetic JSON response.
 * @property {'first'|'aggregate'} [failure] - `first` rethrows the first chunk failure as-is (e.g. preserves `err.status`). Default `aggregate`.
 * @property {string} [errorLabel] - Label for aggregate errors (default `"Batched request"`).
 */

/**
 * Private API helpers: cookie-backed session auth.
 *
 * {@link requestWithPrivateHeaders} awaits `account.actions.refreshServerToken` first (often a no-op
 * when the planner session was validated recently — see cooldown in `tokenActions.refreshServerToken`),
 * then performs `fetch` with browser-managed same-origin cookies.
 * Session identity comes from the session cookie server-side; **`X-WS-Client-ID`** is sent when the
 * realtime layer has assigned a tab id (echo suppression / locks).
 * **Retries** (408 / 429 / 5xx by default) are applied automatically unless `config.retry === false`.
 *
 * **Batching:** pass `config.batch` with `size` and `arrayKey`. The request `body` must be a JSON
 * string of an object containing `arrayKey` as an array; it is split into chunks of at most `size`.
 * Omit `batch` or use `size` &lt; 1 for a single request. Chunks run with `Promise.allSettled` in parallel.
 * Typical sizes (match Go handlers): job-documents PUT 100, POST/DELETE IDs 200; groups PUT 100,
 * DELETE group IDs 200; archived-jobs PUT 100. Document-lock `lock-state-batch` uses two arrays and is
 * chunked in {@link documentLockClient.js} (500 per list). Citadel names already debatches in-module.
 *
 * @module applyPrivateHeaders
 */

/**
 * Pulls `batch` off the config object so the rest is safe for header helpers + single-request path.
 * @param {object} [config]
 * @returns {{ inner: object, batch?: PrivateRequestBatchOptions }}
 */
function stripBatchFromConfig(config) {
  if (!config || typeof config !== "object") {
    return { inner: {} };
  }
  const { batch, ...inner } = config;
  return { inner, batch };
}

/** Resolves planner session id from the client store (for correlation / identity hints). */
export function getSessionIDFromStore() {
  const fromStore = useUserStore.getState()?.account?.sessionID;
  if (typeof fromStore === "string" && fromStore.trim().length > 0) {
    return fromStore.trim();
  }
  return null;
}

/**
 * Merge optional request metadata into fetch options. Private routes use **same-origin cookies**
 * for auth; adds **`X-WS-Client-ID`** when the realtime layer has assigned a tab id.
 *
 * @param {Object} options - Fetch options
 * @param {Object} config - Configuration
 * @param {string} [config.requestName] - Optional name for the request (appears in network tab headers)
 * @returns {Object} Options with headers merged (always returns an object — does not short-circuit on missing session)
 *
 * @example
 * const options = applyPrivateHeaders({
 *   method: 'POST',
 *   body: JSON.stringify(data)
 * });
 */
function applyPrivateHeaders(options = {}, config = {}) {
  const headers = {
    ...options.headers,
    ...(config.requestName && { "X-Request-Name": config.requestName }),
    ...(getRealtimeClientID() && {
      "X-WS-Client-ID": getRealtimeClientID(),
    }),
  };

  return {
    ...options,
    credentials: options.credentials ?? "same-origin",
    headers,
  };
}

/**
 * One attempt: optional session refresh hook, then `fetch` with private headers (cookies + `X-WS-Client-ID`).
 * @param {string} URL
 * @param {Object} options
 * @param {Object} headerConfig - `requestName` only (retry stripped)
 */
async function executePrivateFetchOnce(URL, options, headerConfig) {
  const refresh = useUserStore.getState()?.account?.actions?.refreshServerToken;
  if (typeof refresh === "function") {
    await refresh();
  }

  const enhancedOptions = applyPrivateHeaders(options, headerConfig);

  return fetch(URL, enhancedOptions);
}

/**
 * Single request with retries (no batching).
 * @param {string} URL
 * @param {Object} options
 * @param {Object} config
 */
async function executePrivateRequestSingle(URL, options = {}, config = {}) {
  const { rest: headerConfig, retry } = splitRetryConfig(config);

  const runOnce = () => executePrivateFetchOnce(URL, options, headerConfig);

  if (retry === false) {
    return runOnce();
  }

  const retryOpts =
    retry === undefined || retry === true
      ? {}
      : typeof retry === "object"
        ? retry
        : {};

  return withRequestRetries(runOnce, {
    ...retryOpts,
    isRetriableError: (err) =>
      !(
        err &&
        typeof err.message === "string" &&
        err.message === PRIVATE_AUTH_TOKEN_UNAVAILABLE
      ),
  });
}

/**
 * @param {string} URL
 * @param {Object} options
 * @param {object} innerConfig
 * @param {PrivateRequestBatchOptions} batch
 */
async function executeBatchedPrivateRequest(URL, options, innerConfig, batch) {
  const {
    size,
    arrayKey,
    mergeResponseJsonArrays = false,
    failure = "aggregate",
    errorLabel = "Batched request",
  } = batch;

  if (typeof options.body !== "string") {
    throw new Error("Batched private request requires options.body as a JSON string");
  }

  let bodyObj;
  try {
    bodyObj = JSON.parse(options.body);
  } catch {
    throw new Error("Batched private request body must be valid JSON");
  }

  if (!bodyObj || typeof bodyObj !== "object" || !Array.isArray(bodyObj[arrayKey])) {
    throw new Error(
      `Batched private request body must contain an array property "${arrayKey}"`
    );
  }

  const items = bodyObj[arrayKey];
  const chunks = chunkArray(items, size);

  if (chunks.length === 0) {
    if (mergeResponseJsonArrays) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(null, { status: 204 });
  }

  const methodLabel = options.method || "GET";

  const settled = await Promise.allSettled(
    chunks.map(async (chunk) => {
      const nextBody = { ...bodyObj, [arrayKey]: chunk };
      const res = await executePrivateRequestSingle(
        URL,
        { ...options, body: JSON.stringify(nextBody) },
        innerConfig
      );

      if (mergeResponseJsonArrays) {
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throwNonOkPrivateResponse(res, methodLabel, URL, text, errorLabel);
        }
        const data = await res.json();
        const rows = Array.isArray(data) ? data : [];
        return rows;
      }

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throwNonOkPrivateResponse(res, methodLabel, URL, text, errorLabel);
      }
      return res;
    })
  );

  if (failure === "first") {
    for (const result of settled) {
      if (result.status === "rejected") {
        throw result.reason;
      }
    }
  } else {
    throwIfAnySettledFailed(settled, errorLabel);
  }

  if (mergeResponseJsonArrays) {
    const merged = [];
    for (const r of settled) {
      if (r.status === "fulfilled") {
        merged.push(...r.value);
      }
    }
    return new Response(JSON.stringify(merged), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const last = settled[settled.length - 1];
  return /** @type {PromiseFulfilledResult<Response>} */ (last).value;
}

/**
 * Authenticated `fetch` for private routes: refreshes app session state then sends request
 * with `credentials: "same-origin"` so browser attaches session cookie.
 *
 * Retries transient failures by default (same policy as `withRequestRetries`: 408 / 429 / 5xx).
 * Set `config.retry` to `false` to disable. Pass `config.retry: { maxAttempts, baseDelayMs, … }` to
 * override (merged into `withRequestRetries` options).
 *
 * Optional **`config.batch`**: `{ size, arrayKey, mergeResponseJsonArrays?, failure?, errorLabel? }`.
 * When `size` is omitted or &lt; 1, batching is skipped (one request). See module typedef.
 *
 * @param {string} URL - Request URL
 * @param {Object} options - Request options
 * @param {Object} [config]
 * @param {string} [config.requestName] - Optional name for the request (appears in network tab headers as X-Request-Name)
 * @param {false|true|object} [config.retry] - `false` = no retries; `true`/omit = default retries; object = `withRequestRetries` options
 * @param {PrivateRequestBatchOptions} [config.batch]
 * @returns {Promise<Response>} HTTP response (merged synthetic response when `mergeResponseJsonArrays`)
 * @throws {Error} When the session refresh hook fails, or last network error after retries
 *
 * @example
 * const response = await requestWithPrivateHeaders('/api/v1/jobs/add', {
 *   method: 'POST',
 *   body: JSON.stringify(data)
 * }, { requestName: 'addJob' });
 */
async function requestWithPrivateHeaders(URL, options = {}, config = {}) {
  const { inner: innerConfig, batch } = stripBatchFromConfig(config);

  const useBatch =
    batch &&
    typeof batch.size === "number" &&
    batch.size >= 1 &&
    typeof batch.arrayKey === "string" &&
    batch.arrayKey.length > 0;

  if (batch && !useBatch) {
    throw new Error(
      "requestWithPrivateHeaders: config.batch needs size >= 1 and a non-empty arrayKey (or omit batch for a single request)"
    );
  }

  if (useBatch) {
    return executeBatchedPrivateRequest(URL, options, innerConfig, batch);
  }

  const res = await executePrivateRequestSingle(URL, options, innerConfig);
  if (!res.ok && res.status === 409) {
    try {
      const text = await res.clone().text();
      applyLockHeldElsewhereFromApiBody(text);
    } catch {
      /* ignore */
    }
  }
  return res;
}

export default requestWithPrivateHeaders;
export {
  requestWithPrivateHeaders,
  applyPrivateHeaders,
  chunkArray,
};

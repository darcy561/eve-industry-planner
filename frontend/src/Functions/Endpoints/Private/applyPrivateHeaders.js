import useUserStore from "../../../Zustand/usersStore";
import { chunkArray } from "../chunkArray.js";
import withRequestRetries, {
  apiRateLimitRetryConfig,
  mergeApiRetryOptions,
  splitRetryConfig,
} from "../withRequestRetries.js";
import { getWsClientID } from "../../../WebSocket/wsClientIdentity.js";
import { activePlannerOwnerHandle } from "../../../Zustand/activePlanner/read.js";
import {
  getTabPlannerSessionID,
  tabPlannerSessionRequestHeaders,
} from "../../Auth/tabSessionStorage.js";
import {
  enforceReauthDemand,
  parsePlannerAuthCodeFromResponse,
} from "../../Auth/plannerSessionRedirect.js";
import {
  applyLockHeldElsewhereFromApiBody,
  parseLockHeldElsewhereRefusal,
} from "../../DocumentLock/applyLockHeldElsewhereFromApiResponse.js";
import { DOCUMENT_LOCK_CLIENT_ERROR_LOCK_HELD_ELSEWHERE } from "../../DocumentLock/documentLockEvents.js";
import {
  parseRevisionConflictBody,
  CLIENT_ERROR_REVISION_CONFLICT,
} from "../../Job/sync/revisionConflict.js";

/**
 * Shared private API retry options (honours server `Retry-After` on 429).
 *
 * @see apiRateLimitRetryConfig
 */
export const privateBatchRetryConfig = apiRateLimitRetryConfig;

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
  if (err instanceof Error && err.code) {
    throw err;
  }
  const msg = err instanceof Error ? err.message : String(err);
  throw new Error(
    `${label}: ${failed.length}/${settled.length} batch(es) failed — ${msg}`,
  );
}

/**
 * Throws the error a refused private response carries: a lock or revision refusal by its code,
 * anything else with its status.
 *
 * @param {Response} res
 * @param {string} methodLabel
 * @param {string} url
 * @param {string} text
 * @param {string} [errorLabel]
 * @returns {never}
 */
export function throwNonOkPrivateResponse(
  res,
  methodLabel,
  url,
  text,
  errorLabel,
) {
  if (res.status === 409 && applyLockHeldElsewhereFromApiBody(text)) {
    const label = errorLabel || `${methodLabel} ${url}`;
    const err = new Error(`${label}: document lock held elsewhere (409)`);
    err.code = DOCUMENT_LOCK_CLIENT_ERROR_LOCK_HELD_ELSEWHERE;
    const refusal = parseLockHeldElsewhereRefusal(text);
    err.lockHeldDocIDs = refusal?.rejected ?? null;
    err.savedDocIDs = refusal?.savedDocIDs ?? [];
    throw err;
  }
  if (res.status === 409) {
    const conflict = parseRevisionConflictBody(text);
    if (conflict) {
      const label = errorLabel || `${methodLabel} ${url}`;
      const err = new Error(
        `${label}: document revision conflict (409), ${conflict.rejected.length} refused`,
      );
      err.code = CLIENT_ERROR_REVISION_CONFLICT;
      err.revisionConflict = conflict;
      throw err;
    }
  }
  const err = new Error(
    `${methodLabel} ${url} failed: ${res.status} ${text || res.statusText}`,
  );
  err.status = res.status;
  throw err;
}

/**
 * Thrown / rejected when no authenticated app session is available for a private request (not retried).
 *
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
 * Sends private API requests with this tab's session headers, retrying transient
 * failures and splitting an oversized body into batched requests.
 *
 * @module applyPrivateHeaders
 */

/**
 * Pulls `batch` off the config object so the rest is safe for header helpers + single-request path.
 *
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

/**
 * @param {Response} res
 * @returns {Promise<boolean>}
 */
async function responseIndicatesSessionMissing(res) {
  if (res.status !== 401) return false;
  const text = await res
    .clone()
    .text()
    .catch(() => "");
  return text.includes("session_missing");
}

/**
 * @param {Response} res
 * @returns {Promise<boolean>}
 */
async function handleTerminalPlannerAuthResponse(res) {
  return enforceReauthDemand(await parsePlannerAuthCodeFromResponse(res));
}

/** Resolves planner session id for this tab (sessionStorage, then Zustand). */
export function getSessionIDFromStore() {
  const fromTab = getTabPlannerSessionID();
  if (fromTab) {
    return fromTab;
  }
  const fromStore = useUserStore.getState()?.account?.sessionID;
  if (typeof fromStore === "string" && fromStore.trim().length > 0) {
    return fromStore.trim();
  }
  return null;
}

/**
 * Merges this tab's session, websocket client and planner owner headers into
 * fetch options.
 *
 * @param {Object} options - Fetch options
 * @param {Object} config - Configuration
 * @param {string} [config.requestName] - Optional name for the request (appears in network tab headers)
 * @returns {Object} Options with headers merged (always returns an object — does not short-circuit on missing session)
 */
function applyPrivateHeaders(options = {}, config = {}) {
  const activePlanner = activePlannerOwnerHandle();
  const headers = {
    ...options.headers,
    ...tabPlannerSessionRequestHeaders(),
    ...(config.requestName && { "X-Request-Name": config.requestName }),
    ...(getWsClientID() && {
      "X-WS-Client-ID": getWsClientID(),
    }),
    ...(activePlanner && { "X-Planner-Owner": activePlanner }),
  };

  return {
    ...options,
    credentials: options.credentials ?? "same-origin",
    headers,
  };
}

/**
 * One attempt: optional session refresh hook, then `fetch` with private headers (`X-Session-ID` + `X-WS-Client-ID`).
 *
 * @param {string} URL
 * @param {Object} options
 * @param {Object} headerConfig - `requestName` only (retry stripped)
 */
async function executePrivateFetchOnce(URL, options, headerConfig) {
  if (!headerConfig.skipSessionRefresh) {
    const refresh =
      useUserStore.getState()?.account?.actions?.ensurePlannerSession;
    if (typeof refresh === "function") {
      await refresh();
    }
  }

  const enhancedOptions = applyPrivateHeaders(options, headerConfig);

  return fetch(URL, enhancedOptions);
}

/**
 * Single request with retries (no batching).
 *
 * @param {string} URL
 * @param {Object} options
 * @param {Object} config
 */
async function executePrivateRequestSingle(URL, options = {}, config = {}) {
  const { rest: headerConfig, retry } = splitRetryConfig(config);

  const runOnce = async (sessionRecoveryAttempted = false) => {
    const res = await executePrivateFetchOnce(URL, options, headerConfig);
    if (
      !sessionRecoveryAttempted &&
      !headerConfig.skipSessionRefresh &&
      (await handleTerminalPlannerAuthResponse(res))
    ) {
      const err = new Error("Planner session requires full EVE login");
      err.status = 401;
      throw err;
    }
    if (
      !sessionRecoveryAttempted &&
      !headerConfig.skipSessionRefresh &&
      (await responseIndicatesSessionMissing(res))
    ) {
      const refresh =
        useUserStore.getState()?.account?.actions?.ensurePlannerSession;
      if (typeof refresh === "function") {
        await refresh({ force: true });
        return runOnce(true);
      }
    }
    return res;
  };

  const retryOpts = mergeApiRetryOptions(retry);
  if (retryOpts === false) {
    return runOnce();
  }

  return withRequestRetries(() => runOnce(), {
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
    throw new Error(
      "Batched private request requires options.body as a JSON string",
    );
  }

  let bodyObj;
  try {
    bodyObj = JSON.parse(options.body);
  } catch {
    throw new Error("Batched private request body must be valid JSON");
  }

  if (
    !bodyObj ||
    typeof bodyObj !== "object" ||
    !Array.isArray(bodyObj[arrayKey])
  ) {
    throw new Error(
      `Batched private request body must contain an array property "${arrayKey}"`,
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

  /** @type {PromiseSettledResult<unknown>[]} */
  const settled = [];
  const delivered = [];

  for (const chunk of chunks) {
    try {
      const nextBody = { ...bodyObj, [arrayKey]: chunk };
      const res = await executePrivateRequestSingle(
        URL,
        { ...options, body: JSON.stringify(nextBody) },
        innerConfig,
      );

      if (mergeResponseJsonArrays) {
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throwNonOkPrivateResponse(res, methodLabel, URL, text, errorLabel);
        }
        const data = await res.json();
        const rows = Array.isArray(data) ? data : [];
        settled.push({ status: "fulfilled", value: rows });
        delivered.push(...chunk);
        continue;
      }

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throwNonOkPrivateResponse(res, methodLabel, URL, text, errorLabel);
      }
      settled.push({ status: "fulfilled", value: res });
      delivered.push(...chunk);
    } catch (reason) {
      settled.push({ status: "rejected", reason });
      if (reason && typeof reason === "object" && !reason.deliveredBatchItems) {
        reason.deliveredBatchItems = delivered;
      }
      if (failure === "first") {
        throw reason;
      }
      throwIfAnySettledFailed(settled, errorLabel);
    }
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
 * Authenticated `fetch` for a private route, refreshing the app session first and
 * retrying transient failures.
 *
 * @param {string} URL - Request URL
 * @param {Object} options - Request options
 * @param {Object} [config]
 * @param {string} [config.requestName] - Optional name for the request (appears in network tab headers as X-Request-Name)
 * @param {false|true|object} [config.retry] - `false` = no retries; `true`/omit = default retries; object = `withRequestRetries` options
 * @param {PrivateRequestBatchOptions} [config.batch]
 * @returns {Promise<Response>} HTTP response (merged synthetic response when `mergeResponseJsonArrays`)
 * @throws {Error} When the session refresh hook fails, or last network error after retries
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
      "requestWithPrivateHeaders: config.batch needs size >= 1 and a non-empty arrayKey (or omit batch for a single request)",
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
export { requestWithPrivateHeaders, applyPrivateHeaders, chunkArray };

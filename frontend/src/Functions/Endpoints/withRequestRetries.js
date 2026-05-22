/**
 * Retries for HTTP `fetch` (or any `() => Promise<Response>`).
 *
 * **`requestWithPrivateHeaders` and `fetchWithPublicHeaders` apply retries by default** (see their
 * `config.retry` option). Use this module directly when you need retries without those helpers.
 *
 * @module withRequestRetries
 */

/**
 * Pulls `retry` from a request config so the rest can be passed to header helpers (`requestName`, etc.).
 * @param {object} [config]
 * @returns {{ rest: object, retry: undefined|boolean|object }}
 */
export function splitRetryConfig(config) {
  if (!config || typeof config !== "object") {
    return { rest: {}, retry: undefined };
  }
  const { retry, ...rest } = config;
  return { rest, retry };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Cap for 429 backoff (private `200-M` / public `50-S` fixed windows). */
export const MAX_RATE_LIMIT_RETRY_DELAY_MS = 120_000;

/**
 * Default retry options for Eve Industry Planner API clients.
 * On 429, {@link getRetryDelayMs} waits for the server fixed-window `Retry-After` (seconds)
 * from `services/api/middleware/ratelimiter.go`, then `X-RateLimit-Reset`.
 */
export const apiRateLimitRetryConfig = Object.freeze({
  maxAttempts: 4,
  baseDelayMs: 350,
});

/**
 * Merges {@link apiRateLimitRetryConfig} with per-call overrides. Pass `false` to disable retries.
 *
 * @param {false|true|undefined|object} retry - `requestWithPrivateHeaders` / `fetchWithPublicHeaders` `config.retry`
 * @returns {false|object}
 */
export function mergeApiRetryOptions(retry) {
  if (retry === false) {
    return false;
  }
  const base = { ...apiRateLimitRetryConfig };
  if (retry === undefined || retry === true) {
    return base;
  }
  if (typeof retry === "object") {
    return { ...base, ...retry };
  }
  return base;
}

/**
 * Delay before the next attempt after a retriable HTTP response.
 * For 429, prefers `Retry-After` then `X-RateLimit-Reset` (ulule private/public limiter).
 *
 * @param {Response|undefined} response
 * @param {number} attempt - 1-based attempt that just failed
 * @param {number} baseDelayMs
 * @returns {number}
 */
export function getRetryDelayMs(response, attempt, baseDelayMs) {
  if (!response || response.status !== 429) {
    return baseDelayMs * attempt;
  }

  const retryAfter = response.headers.get("Retry-After");
  if (retryAfter) {
    const asSeconds = Number(retryAfter);
    if (Number.isFinite(asSeconds) && asSeconds > 0) {
      return Math.min(asSeconds * 1000 + 100, MAX_RATE_LIMIT_RETRY_DELAY_MS);
    }
    const retryAt = Date.parse(retryAfter);
    if (Number.isFinite(retryAt)) {
      const waitMs = retryAt - Date.now();
      if (waitMs > 0) {
        return Math.min(waitMs + 100, MAX_RATE_LIMIT_RETRY_DELAY_MS);
      }
    }
  }

  const resetHeader = response.headers.get("X-RateLimit-Reset");
  if (resetHeader) {
    const resetSec = Number(resetHeader);
    if (Number.isFinite(resetSec) && resetSec > 0) {
      const waitSec = resetSec - Date.now() / 1000;
      if (waitSec > 0 && waitSec <= 120) {
        return Math.min(Math.ceil(waitSec * 1000) + 100, MAX_RATE_LIMIT_RETRY_DELAY_MS);
      }
    }
  }

  return baseDelayMs * attempt;
}

/**
 * Default policy for private API + middleware: retry rate limits, timeouts, and server errors.
 * Non-retriable: 4xx except 408/429 (e.g. 400, 401, 403, 405).
 *
 * @param {number} status
 * @returns {boolean}
 */
export function defaultIsRetriableHttpStatus(status) {
  return status >= 500 || status === 429 || status === 408;
}

/**
 * @typedef {Object} WithRequestRetriesOptions
 * @property {number} [maxAttempts=3]
 * @property {number} [baseDelayMs=350] - Linear backoff for non-429 failures. 429 uses server `Retry-After` / `X-RateLimit-Reset` via {@link getRetryDelayMs}.
 * @property {(status: number) => boolean} [isRetriableStatus] - Defaults to {@link defaultIsRetriableHttpStatus}.
 * @property {(err: unknown) => boolean} [isRetriableError] - If `false`, the error is rethrown immediately (no more attempts). Defaults to always retriable.
 */

/**
 * Runs `requestFn` until success, non-retriable HTTP status, or attempts exhausted.
 * On retriable HTTP errors, consumes the response body before waiting (so the connection can be reused).
 *
 * @param {() => Promise<Response>} requestFn
 * @param {WithRequestRetriesOptions} [options]
 * @returns {Promise<Response>} Last response if HTTP error path; successful `response.ok` returns immediately.
 * @throws {Error} If the last attempt throws (e.g. network); does not throw for `!response.ok` unless you run out of attempts with non-retriable status... actually we return response. Throws only when requestFn throws and attempt === maxAttempts.
 */
export async function withRequestRetries(requestFn, options = {}) {
  const {
    maxAttempts = 3,
    baseDelayMs = 350,
    isRetriableStatus = defaultIsRetriableHttpStatus,
    isRetriableError = () => true,
  } = options;

  const attempts = Math.max(1, maxAttempts);

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await requestFn();

      if (response.ok) {
        return response;
      }

      const retriable = isRetriableStatus(response.status);
      if (!retriable || attempt === attempts) {
        return response;
      }

      await response.text().catch(() => {});
      await sleep(getRetryDelayMs(response, attempt, baseDelayMs));
      continue;
    } catch (err) {
      if (!isRetriableError(err) || attempt === attempts) {
        throw err;
      }
    }

    await sleep(baseDelayMs * attempt);
  }
}

export default withRequestRetries;

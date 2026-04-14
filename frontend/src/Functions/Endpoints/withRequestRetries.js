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
 * @property {number} [baseDelayMs=350] - Linear backoff: after failure on attempt `n`, waits `baseDelayMs * n` ms before the next attempt.
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
    } catch (err) {
      if (!isRetriableError(err) || attempt === attempts) {
        throw err;
      }
    }

    await sleep(baseDelayMs * attempt);
  }
}

export default withRequestRetries;

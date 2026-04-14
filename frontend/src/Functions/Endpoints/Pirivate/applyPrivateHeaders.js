import useUserStore from "../../../Zustand/usersStore";
import withRequestRetries, { splitRetryConfig } from "../withRequestRetries.js";

/**
 * Thrown / rejected when no Bearer token exists for a private request (not retried).
 * @type {string}
 */
export const PRIVATE_AUTH_TOKEN_UNAVAILABLE =
  "Authentication required but no server token available";

/**
 * Private API helpers: Bearer app JWT (`account.accessToken`).
 *
 * {@link requestWithPrivateHeaders} awaits `account.actions.refreshServerToken` first when the token
 * is near expiry (same buffer as elsewhere), then attaches the current Bearer token and `fetch`es.
 * **Retries** (408 / 429 / 5xx by default) are applied automatically unless `config.retry === false`.
 *
 * @module applyPrivateHeaders
 */

/**
 * Get server access token from Zustand store
 * @returns {string|null} Server access token or null if not available
 */
function getServerToken() {
  try {
    const serverToken = useUserStore
      .getState()
      .account.actions.getServerAccessToken();
    return serverToken;
  } catch (error) {
    console.error("Failed to get server token:", error);
    return null;
  }
}

/**
 * Apply private headers (Authorization Bearer token) to options
 * Private endpoints always require authentication.
 * @param {Object} options - Fetch options
 * @param {Object} config - Configuration
 * @param {string} [config.requestName] - Optional name for the request (appears in network tab headers)
 * @returns {Object|null} Options with private headers applied, or null if token not available
 *
 * @example
 * const options = applyPrivateHeaders({
 *   method: 'POST',
 *   body: JSON.stringify(data)
 * });
 */
function applyPrivateHeaders(options = {}, config = {}) {
  const serverToken = getServerToken();

  if (!serverToken) {
    console.error("No server access token available - authentication required for private endpoints");
    return null;
  }

  const headers = {
    ...options.headers,
    Authorization: `Bearer ${serverToken}`,
    ...(config.requestName && { "X-Request-Name": config.requestName }),
  };

  return {
    ...options,
    headers,
  };
}

/**
 * One attempt: refresh token if configured, then fetch with private headers.
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

  if (!enhancedOptions) {
    throw new Error(PRIVATE_AUTH_TOKEN_UNAVAILABLE);
  }

  return fetch(URL, enhancedOptions);
}

/**
 * Authenticated `fetch` for private routes: refreshes the app JWT when inside the expiry buffer,
 * then sends the request with `Authorization: Bearer`.
 *
 * Retries transient failures by default (same policy as `withRequestRetries`: 408 / 429 / 5xx).
 * Set `config.retry` to `false` to disable. Pass `config.retry: { maxAttempts, baseDelayMs, … }` to
 * override (merged into `withRequestRetries` options).
 *
 * @param {string} URL - Request URL
 * @param {Object} options - Request options
 * @param {Object} [config]
 * @param {string} [config.requestName] - Optional name for the request (appears in network tab headers as X-Request-Name)
 * @param {false|true|object} [config.retry] - `false` = no retries; `true`/omit = default retries; object = `withRequestRetries` options
 * @returns {Promise<Response>} HTTP response
 * @throws {Error} When authentication token is not available (after refresh), or last network error after retries
 *
 * @example
 * const response = await requestWithPrivateHeaders('/api/v1/jobs/add', {
 *   method: 'POST',
 *   body: JSON.stringify(data)
 * }, { requestName: 'addJob' });
 */
async function requestWithPrivateHeaders(URL, options = {}, config = {}) {
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

export default requestWithPrivateHeaders;
export { requestWithPrivateHeaders, applyPrivateHeaders };

import GLOBAL_CONFIG from "../../../global-config-app";
import withRequestRetries, { splitRetryConfig } from "../withRequestRetries.js";

const {
  DEFAULT_DISCORD_INVITE,
  DEFAULT_GITHUB_LINK,
  DEFAULT_INGAME_SUPPORT_MAIL_CHARACTER,
} = GLOBAL_CONFIG;

/**
 * Default headers for all API requests (public headers)
 */
const defaultHeaders = {
  "X-User-Agent": `Eve Industry Planner/client/V${__APP_VERSION__} (eve: Oswold Saraki/${DEFAULT_INGAME_SUPPORT_MAIL_CHARACTER}; discordID: darcy561; discordURL: ${DEFAULT_DISCORD_INVITE}; Github: ${DEFAULT_GITHUB_LINK})`,
};

/**
 * Apply public headers (default headers) to options
 * @param {Object} options - Fetch options
 * @param {Object} config - Configuration
 * @param {string} [config.requestName] - Optional name for the request (appears in network tab headers)
 * @returns {Object} Options with public headers applied
 *
 * @example
 * const options = applyPublicHeaders({
 *   method: 'GET',
 *   headers: { 'Content-Type': 'application/json' }
 * });
 */
export function applyPublicHeaders(options = {}, config = {}) {
  const headers = {
    ...defaultHeaders,
    ...options.headers,
    ...(config.requestName && { "X-Request-Name": config.requestName }),
  };
  return {
    ...options,
    headers
  };
}

/**
 * Enhanced fetch with only public headers (no authentication).
 *
 * **Retries** (408 / 429 / 5xx by default) are applied automatically unless `config.retry === false`.
 * Pass `config.retry: { maxAttempts, baseDelayMs, … }` to override.
 *
 * @param {string} URL - Request URL
 * @param {Object} options - Fetch options
 * @param {Object} [config]
 * @param {string} [config.requestName] - Optional name for the request (appears in network tab headers as X-Request-Name)
 * @param {false|true|object} [config.retry] - `false` = no retries; `true`/omit = default retries; object = `withRequestRetries` options
 * @returns {Promise<Response>} HTTP response
 *
 * @example
 * const response = await fetchWithPublicHeaders('/api/v1/systemindexes', {
 *   method: 'GET'
 * }, { requestName: 'fetchSystemIndexes' });
 */
export async function fetchWithPublicHeaders(URL, options = {}, config = {}) {
  const { rest: headerConfig, retry } = splitRetryConfig(config);

  const runOnce = async () => {
    const enhancedOptions = applyPublicHeaders(options, headerConfig);
    return fetch(URL, enhancedOptions);
  };

  if (retry === false) {
    return runOnce();
  }

  const retryOpts =
    retry === undefined || retry === true
      ? {}
      : typeof retry === "object"
        ? retry
        : {};

  return withRequestRetries(runOnce, retryOpts);
}

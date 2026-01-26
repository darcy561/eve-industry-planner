import GLOBAL_CONFIG from "../../../global-config-app";

const { DEFAULT_DISCORD_INVITE, DEFAULT_GITHUB_LINK } = GLOBAL_CONFIG;

/**
 * Default headers for all API requests (public headers)
 */
const defaultHeaders = {
  "X-User-Agent": `Eve Industry Planner/client/V${__APP_VERSION__} (eve: Oswold Saraki/Reginal Shardani; discordID: darcy561; discordURL: ${DEFAULT_DISCORD_INVITE}; Github: ${DEFAULT_GITHUB_LINK})`,
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
 * Enhanced fetch with only public headers (no authentication)
 * 
 * @param {string} URL - Request URL
 * @param {Object} options - Fetch options
 * @param {Object} config - Configuration
 * @param {string} [config.requestName] - Optional name for the request (appears in network tab headers as X-Request-Name)
 * @returns {Promise<Response>} HTTP response
 * 
 * @example
 * const response = await fetchWithPublicHeaders('/api/v1/systemindexes', {
 *   method: 'GET'
 * }, { requestName: 'fetchSystemIndexes' });
 */
export async function fetchWithPublicHeaders(URL, options = {}, config = {}) {
  const enhancedOptions = applyPublicHeaders(options, config);
  return fetch(URL, enhancedOptions);
}


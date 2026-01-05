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
 * @returns {Object} Options with public headers applied
 * 
 * @example
 * const options = applyPublicHeaders({
 *   method: 'GET',
 *   headers: { 'Content-Type': 'application/json' }
 * });
 */
export function applyPublicHeaders(options = {}) {
  const headers = { ...defaultHeaders, ...options.headers };
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
 * @returns {Promise<Response>} HTTP response
 * 
 * @example
 * const response = await fetchWithPublicHeaders('/api/v1/systemindexes', {
 *   method: 'GET'
 * });
 */
export async function fetchWithPublicHeaders(URL, options = {}) {
  const enhancedOptions = applyPublicHeaders(options);
  return fetch(URL, enhancedOptions);
}


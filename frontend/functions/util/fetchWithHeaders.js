import { APP_VERSION } from "../global-config-functions.js";

/**
 * Default headers configuration for EVE Online ESI API requests.
 * 
 * This object contains the standard User-Agent header required by EVE Online ESI API:
 * - Includes application name and version information
 * - Contains developer contact information (EVE character, Discord)
 * - Provides GitHub repository link for transparency
 * - Follows EVE Online ESI API User-Agent requirements
 * 
 * @type {Object}
 * @property {string} User-Agent - Standardized User-Agent string for ESI API requests
 * 
 * @example
 * // The User-Agent format follows EVE Online requirements:
 * // "AppName/Version (eve:CharacterName/CorporationName; discordID:username; discordURL:+discord_link; Github:+github_link)"
 */
const defaultHeaders = {
  "User-Agent": `Eve Industry Planner/V${APP_VERSION} (eve:Oswold Saraki/Reginal Shardani; discordID:darcy561; discordURL:+https://discord.gg/KGSa8gh37z; Github:+https://github.com/darcy561/Eve-Industry-Planner-React)`,
};

/**
 * Performs HTTP requests with custom headers and EVE Online ESI API compliance.
 * 
 * This utility function enhances the standard fetch API with EVE Online ESI API requirements:
 * - Automatically includes required User-Agent header for ESI API compliance
 * - Merges custom headers with default headers (custom headers take precedence)
 * - Supports all standard fetch options including abort signals
 * - Handles both `signal` and `abortSignal` options for compatibility
 * - Provides consistent header management across all ESI API requests
 * 
 * The request process:
 * 1. Merges default headers with any provided custom headers
 * 2. Ensures User-Agent header is always present for ESI API compliance
 * 3. Passes through all other fetch options (method, body, etc.)
 * 4. Handles abort signal compatibility for request cancellation
 * 
 * @param {string} URL - The URL to fetch from (typically EVE ESI API endpoints)
 * @param {Object} options - Fetch options object
 * @param {Object} [options.headers] - Additional headers to include with the request
 * @param {string} [options.method] - HTTP method (GET, POST, PUT, DELETE, etc.)
 * @param {Object} [options.body] - Request body for POST/PUT requests
 * @param {AbortSignal} [options.signal] - Abort signal for request cancellation
 * @param {AbortSignal} [options.abortSignal] - Alternative abort signal property for compatibility
 * @param {Object} [options.credentials] - Credentials mode for the request
 * @param {Object} [options.cache] - Cache mode for the request
 * @param {Object} [options.redirect] - Redirect mode for the request
 * @param {Object} [options.referrer] - Referrer for the request
 * @param {Object} [options.mode] - Request mode (cors, no-cors, same-origin)
 * @returns {Promise<Response>} Promise that resolves to the Response object
 * 
 * @example
 * // Basic GET request to ESI API
 * const response = await fetchWithCustomHeaders('https://esi.evetech.net/latest/characters/123456789/');
 * const data = await response.json();
 * console.log('Character data:', data);
 * 
 * @example
 * // POST request with custom headers and body
 * const response = await fetchWithCustomHeaders('https://esi.evetech.net/latest/characters/123456789/assets/', {
 *   method: 'POST',
 *   headers: {
 *     'Authorization': 'Bearer access_token_here',
 *     'Content-Type': 'application/json'
 *   },
 *   body: JSON.stringify({ location_id: 60003760 })
 * });
 * 
 * @example
 * // Request with abort signal for cancellation
 * const controller = new AbortController();
 * const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
 * 
 * try {
 *   const response = await fetchWithCustomHeaders('https://esi.evetech.net/latest/markets/prices/', {
 *     signal: controller.signal
 *   });
 *   clearTimeout(timeoutId);
 *   const data = await response.json();
 * } catch (error) {
 *   if (error.name === 'AbortError') {
 *     console.log('Request was aborted');
 *   }
 * }
 * 
 * @example
 * // Request with custom headers that override defaults
 * const response = await fetchWithCustomHeaders('https://esi.evetech.net/latest/characters/123456789/', {
 *   headers: {
 *     'Authorization': 'Bearer access_token',
 *     'User-Agent': 'Custom User Agent Override' // This will override the default User-Agent
 *   }
 * });
 * 
 * @throws {TypeError} When URL is not a valid string
 * @throws {Error} When fetch request fails (network error, HTTP error, etc.)
 * @throws {AbortError} When request is aborted via abort signal
 * 
 * @see {@link https://esi.evetech.net/} EVE Online ESI API documentation
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API} MDN Fetch API documentation
 */
async function fetchWithCustomHeaders(URL, options = {}) {
  const headers = { ...defaultHeaders, ...options.headers };

  return fetch(URL, {
    ...options,
    headers,
    // Ensure abort signal is passed through if provided
    signal: options.signal || options.abortSignal,
  });
}

export default fetchWithCustomHeaders;

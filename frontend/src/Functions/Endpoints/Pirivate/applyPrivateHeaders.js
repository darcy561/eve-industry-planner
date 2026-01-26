import useUserStore from "../../../Zustand/usersStore";

/**
 * Get server access token from Zustand store
 * @returns {string|null} Server access token or null if not available
 */
function getServerToken() {
  try {
    const serverToken = useUserStore
      .getState()
      .users.actions.getServerAccessToken();
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
 * Enhanced HTTP request with private headers (authentication)
 * Private endpoints always require authentication - token is mandatory.
 * Only applies Authorization header - use applyPublicHeaders separately if needed
 *
 * @param {string} URL - Request URL
 * @param {Object} options - Request options
 * @param {Object} config - Configuration
 * @param {string} [config.requestName] - Optional name for the request (appears in network tab headers as X-Request-Name)
 * @returns {Promise<Response>} HTTP response
 * @throws {Error} Throws error if authentication token is not available
 *
 * @example
 * const response = await requestWithPrivateHeaders('/api/v1/jobs/add', {
 *   method: 'POST',
 *   body: JSON.stringify(data)
 * }, { requestName: 'addJob' });
 */
async function requestWithPrivateHeaders(URL, options = {}, config = {}) {
  const enhancedOptions = applyPrivateHeaders(options, config);

  if (!enhancedOptions) {
    return Promise.reject(
      new Error("Authentication required but no server token available")
    );
  }

  return fetch(URL, enhancedOptions);
}

export default requestWithPrivateHeaders;
export { requestWithPrivateHeaders, applyPrivateHeaders };

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
 * @param {Object} options - Fetch options
 * @param {Object} config - Configuration
 * @param {boolean} config.requireToken - Force token requirement even if not available (default: false)
 * @returns {Object|null} Options with private headers applied, or null if token required but not available
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
    if (config.requireToken) {
      console.error("No server access token available but token is required");
      return null;
    }
    console.warn(
      "No server access token available, skipping Authorization header"
    );
    return options;
  }

  const headers = {
    ...options.headers,
    Authorization: `Bearer ${serverToken}`,
  };

  return {
    ...options,
    headers,
  };
}

/**
 * Enhanced fetch with private headers (authentication)
 * Only applies Authorization header - use applyPublicHeaders separately if needed
 *
 * @param {string} URL - Request URL
 * @param {Object} options - Fetch options
 * @param {Object} config - Configuration
 * @param {boolean} config.requireToken - Force token requirement (default: false)
 * @returns {Promise<Response>} HTTP response
 *
 * @example
 * const response = await fetchWithPrivateHeaders('/api/v1/jobs/add', {
 *   method: 'POST',
 *   body: JSON.stringify(data)
 * });
 */
async function fetchWithPrivateHeaders(URL, options = {}, config = {}) {
  const enhancedOptions = applyPrivateHeaders(options, config);

  if (!enhancedOptions && config.requireToken) {
    return Promise.reject(
      new Error("Authentication required but no server token available")
    );
  }

  return fetch(URL, enhancedOptions || options);
}

export default fetchWithPrivateHeaders;
export { fetchWithPrivateHeaders, applyPrivateHeaders };

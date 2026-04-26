import GLOBAL_CONFIG from "../../global-config-app";
import esiFetchWrapper from "./Classes/ESIFetchWrapper.js";
import esiQueueManager from "./Classes/ESIQueueManager.js";

const {
  DEFAULT_DISCORD_INVITE,
  DEFAULT_GITHUB_LINK,
  DEFAULT_INGAME_SUPPORT_MAIL_CHARACTER,
} = GLOBAL_CONFIG;

const defaultHeaders = {
  "X-User-Agent": `Eve Industry Planner/client/V${__APP_VERSION__} (eve: Oswold Saraki/${DEFAULT_INGAME_SUPPORT_MAIL_CHARACTER}; discordID: darcy561; discordURL: ${DEFAULT_DISCORD_INVITE}; Github: ${DEFAULT_GITHUB_LINK})`,
};

/**
 * Sets X-Compatibility-Date on ESI requests when not already provided (EVE ESI date-based versioning).
 * @param {string} URL
 * @param {Record<string, string>} headers
 */
function applyEsiCompatibilityHeader(URL, headers) {
  const isESI =
    URL.includes("esi.evetech.net") || URL.includes("esi.eveonline.com");
  if (
    isESI &&
    headers["X-Compatibility-Date"] == null &&
    headers["x-compatibility-date"] == null
  ) {
    headers["X-Compatibility-Date"] = GLOBAL_CONFIG.ESI_COMPATIBILITY_DATE;
  }
}

/**
 * Enhanced fetch with ESI rate limiting
 * @param {string} URL - Request URL
 * @param {Object} options - Fetch options
 * @param {Object} config - Additional configuration
 * @returns {Promise<Response>} HTTP response
 */
async function fetchWithCustomHeaders(URL, options = {}, config = {}) {
  const headers = { ...defaultHeaders, ...options.headers };
  applyEsiCompatibilityHeader(URL, headers);

  // Check if this is an ESI endpoint
  const isESIEndpoint = URL.includes('esi.evetech.net') || URL.includes('esi.eveonline.com');

  if (isESIEndpoint) {
    // Use group from config if provided, otherwise will be discovered from headers
    // Check if rate limiting is disabled
    const isIndividuallyDisabled = config.disabled === true || options.disabled === true;

    if (isIndividuallyDisabled) {
      // Use regular fetch when rate limiting is disabled
      return fetch(URL, {
        ...options,
        headers,
      });
    }

    // Use ESI rate limiting for EVE Online endpoints
    const enhancedOptions = {
      ...options,
      headers
    };

    // Enhanced config with characterHash support
    const enhancedConfig = {
      ...config,
      characterHash: config.characterHash || options.characterHash
    };

    // Use queue manager for better request management
    if (config.useQueue !== false) {
      return esiQueueManager.addRequest(URL, enhancedOptions, enhancedConfig);
    } else {
      return esiFetchWrapper.fetch(URL, enhancedOptions, enhancedConfig);
    }
  } else {
    // Use regular fetch for non-ESI endpoints
    return fetch(URL, {
      ...options,
      headers,
    });
  }
}

/**
 * Direct ESI fetch without queue management (for immediate requests)
 * @param {string} URL - Request URL
 * @param {Object} options - Fetch options
 * @param {Object} config - Additional configuration
 * @returns {Promise<Response>} HTTP response
 */
async function fetchESIDirect(URL, options = {}, config = {}) {
  const headers = { ...defaultHeaders, ...options.headers };
  applyEsiCompatibilityHeader(URL, headers);
  const enhancedOptions = {
    ...options,
    headers
  };

  return esiFetchWrapper.fetch(URL, enhancedOptions, config);
}

/**
 * Queue an ESI request for processing
 * @param {string} URL - Request URL
 * @param {Object} options - Fetch options
 * @param {Object} config - Additional configuration
 * @returns {Promise<Response>} HTTP response
 */
async function fetchESIQueued(URL, options = {}, config = {}) {
  const headers = { ...defaultHeaders, ...options.headers };
  applyEsiCompatibilityHeader(URL, headers);
  const enhancedOptions = {
    ...options,
    headers
  };

  return esiQueueManager.addRequest(URL, enhancedOptions, config);
}

/**
 * Get rate limit status for all ESI endpoints
 * @returns {Array} Array of rate limit statuses
 */
function getESIRateLimitStatuses() {
  return esiFetchWrapper.getAllRateLimitStatuses();
}

/**
 * Get rate limit status for a specific group and userID pair
 * @param {string} group - Rate limit group
 * @param {string} userID - User identifier (characterHash)
 * @returns {Object} Rate limit status for the specific (group, userID) pair
 */
function getESIRateLimitStatus(group, userID) {
  return esiFetchWrapper.getRateLimitStatus(group, userID);
}

/**
 * Get queue status for all ESI endpoints
 * @returns {Object} Queue statuses
 */
function getESIQueueStatuses() {
  return esiQueueManager.getAllQueueStatuses();
}

/**
 * Clear all ESI rate limits and queues
 */
function clearESILimits() {
  esiFetchWrapper.clearRateLimits();
  esiQueueManager.clearAllQueues();
}

export default fetchWithCustomHeaders;
export {
  fetchESIDirect,
  fetchESIQueued,
  getESIRateLimitStatuses,
  getESIRateLimitStatus,
  getESIQueueStatuses,
  clearESILimits
};

import GLOBAL_CONFIG from "../../global-config-app";
import esiFetchWrapper from "./Classes/ESIFetchWrapper.js";
import esiQueueManager from "./Classes/ESIQueueManager.js";

const { DEFAULT_DISCORD_INVITE, DEFAULT_GITHUB_LINK } = GLOBAL_CONFIG;

const defaultHeaders = {
  "X-User-Agent": `Eve Industry Planner/client/V${__APP_VERSION__} (eve: Oswold Saraki/Reginal Shardani; discordID: darcy561; discordURL: ${DEFAULT_DISCORD_INVITE}; Github: ${DEFAULT_GITHUB_LINK})`,
};

/**
 * Enhanced fetch with ESI rate limiting
 * @param {string} URL - Request URL
 * @param {Object} options - Fetch options
 * @param {Object} config - Additional configuration
 * @returns {Promise<Response>} HTTP response
 */
async function fetchWithCustomHeaders(URL, options = {}, config = {}) {
  const headers = { ...defaultHeaders, ...options.headers };
  
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

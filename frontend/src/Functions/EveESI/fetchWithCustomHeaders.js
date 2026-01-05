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
    // Extract rate limit group from URL or config
    const group = config.group || extractRateLimitGroup(URL);
    
    // Check if rate limiting is disabled for this group
    const isGroupDisabled = esiFetchWrapper.isGroupDisabled(group);
    const isIndividuallyDisabled = config.disabled === true || options.disabled === true;
    
    if (isGroupDisabled || isIndividuallyDisabled) {
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
 * Extract rate limit group from URL
 * @param {string} URL - Request URL
 * @returns {string} Rate limit group
 */
function extractRateLimitGroup(URL) {
  // Core groups
  if (URL.includes('/markets/')) return 'market';
  if (URL.includes('/characters/')) return 'character';
  if (URL.includes('/corporations/')) return 'corporation';
  if (URL.includes('/universe/')) return 'universe';
  
  // 13 October 2025 rollout
  if (URL.includes('/status/')) return 'status';
  
  // 27 October 2025 rollout
  if (URL.includes('/fw/')) return 'fw';
  if (URL.includes('/incursions/')) return 'incursions';
  if (URL.includes('/insurance/')) return 'insurance';
  if (URL.includes('/routes/')) return 'routes';
  if (URL.includes('/sovereignty/')) return 'sovereignty';
  
  // 30 October 2025 rollout
  if (URL.includes('/fitting/')) return 'fitting';
  if (URL.includes('/fleets/')) return 'fleets';
  if (URL.includes('/industry/')) return 'industry';
  if (URL.includes('/notifications/')) return 'notifications';
  if (URL.includes('/ui/')) return 'ui';
  
  // 3 November 2025 rollout
  if (URL.includes('/location/')) return 'location';
  
  // 6 November 2025 rollout
  if (URL.includes('/killmails/')) return 'killmails';
  if (URL.includes('/wars/')) return 'wars';
  if (URL.includes('/conflicts/')) return 'conflicts';
  
  // 10 November 2025 rollout
  if (URL.includes('/alliances/')) return 'alliances';
  
  // 13 November 2025 rollout
  if (URL.includes('/skills/')) return 'skills';
  if (URL.includes('/attributes/')) return 'attributes';
  if (URL.includes('/portrait/')) return 'portrait';
  
  // 24 November 2025 rollout
  if (URL.includes('/assets/')) return 'assets';
  
  // 27 November 2025 rollout
  if (URL.includes('/contracts/')) return 'contracts';
  
  return 'default';
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
  getESIQueueStatuses, 
  clearESILimits
};

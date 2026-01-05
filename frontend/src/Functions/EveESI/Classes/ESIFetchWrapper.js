/**
 * ESI Fetch Wrapper - Enhanced fetch wrapper with rate limiting and retry logic
 * Handles ESI rate limit headers, 429 responses, and automatic retries
 */

import ESIRateLimiter from "./ESIRateLimiter.js";
import fetchWithCustomHeaders from "../fetchWithCustomHeaders.js";

class ESIFetchWrapper {
  constructor() {
    this.rateLimiter = new ESIRateLimiter();
    this.maxRetries = 3;
    this.baseRetryDelay = 1000; // 1 second
  }

  /**
   * Extract rate limit group from URL
   * @param {string} url - ESI endpoint URL
   * @returns {string} Rate limit group
   */
  extractRateLimitGroup(url) {
    // Map URL patterns to rate limit groups
    if (url.includes("/markets/")) return "market";
    if (url.includes("/characters/")) return "character";
    if (url.includes("/corporations/")) return "corporation";
    if (url.includes("/universe/")) return "universe";
    if (url.includes("/alliances/")) return "alliance";
    if (url.includes("/factions/")) return "faction";
    if (url.includes("/fw/")) return "factionwarfare";
    if (url.includes("/incursions/")) return "incursions";
    if (url.includes("/killmails/")) return "killmails";
    if (url.includes("/loyalty/")) return "loyalty";
    if (url.includes("/opportunities/")) return "opportunities";
    if (url.includes("/planetary/")) return "planetary";
    if (url.includes("/route/")) return "route";
    if (url.includes("/search/")) return "search";
    if (url.includes("/sovereignty/")) return "sovereignty";
    if (url.includes("/status/")) return "status";
    if (url.includes("/wars/")) return "wars";

    return "default";
  }

  /**
   * Generate user ID for rate limiting
   * @param {Object} options - Request options
   * @param {string} characterHash - Character hash identifier
   * @returns {string} User ID
   */
  generateUserID(options = {}, characterHash = null) {
    // For authenticated requests, use characterHash if provided
    if (characterHash) {
      return characterHash;
    }

    // For authenticated requests without characterHash, try to extract from token
    if (options.headers?.Authorization) {
      const authHeader = options.headers.Authorization;
      if (authHeader.startsWith("Bearer ")) {
        // For now, use a placeholder - you'd need to decode the JWT
        return `app:authenticated`;
      }
    }

    // For non-authenticated requests, use source IP
    // In a browser environment, we can't get the real IP, so we'll use a fallback
    return `app:anonymous`;
  }

  /**
   * Handle 429 rate limit response
   * @param {Response} response - HTTP response
   * @returns {Promise} Promise that resolves after retry delay
   */
  async handleRateLimit(response) {
    const retryAfter = response.headers.get("Retry-After");
    const waitTime = retryAfter ? parseInt(retryAfter, 10) * 1000 : 5000; // Default 5 seconds

    console.warn(`Rate limited. Waiting ${waitTime}ms before retry...`);
    await this.rateLimiter.sleep(waitTime);
  }

  /**
   * Calculate exponential backoff delay
   * @param {number} attempt - Current attempt number (0-based)
   * @returns {number} Delay in milliseconds
   */
  calculateBackoffDelay(attempt) {
    return this.baseRetryDelay * Math.pow(2, attempt) + Math.random() * 1000;
  }

  /**
   * Enhanced fetch with rate limiting and retry logic
   * @param {string} url - Request URL
   * @param {Object} options - Fetch options
   * @param {Object} config - Additional configuration
   * @returns {Promise<Response>} HTTP response
   */
  async fetch(url, options = {}, config = {}) {
    const group = this.extractRateLimitGroup(url);
    const userID = this.generateUserID(options, config.characterHash);
    const maxRetries = config.maxRetries || this.maxRetries;

    let lastError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Check rate limits before making request
        const canMake = this.rateLimiter.canMakeRequest(group, userID);

        if (!canMake.canProceed) {
          console.log(
            `Rate limit reached for ${group}. Waiting ${canMake.waitTime}ms...`
          );
          await this.rateLimiter.sleep(canMake.waitTime);
        }

        // Make the request using native fetch to avoid circular dependency
        const response = await fetch(url, options);

        // Update rate limiter with response headers
        this.rateLimiter.updateBucketFromHeaders(
          group,
          userID,
          response.headers
        );

        // Handle different response statuses
        if (response.status === 429) {
          // Rate limited - handle retry
          await this.handleRateLimit(response);
          continue; // Retry the request
        }

        if (response.status >= 500) {
          // Server error - retry with exponential backoff
          if (attempt < maxRetries) {
            const delay = this.calculateBackoffDelay(attempt);
            console.warn(
              `Server error ${response.status}. Retrying in ${delay}ms...`
            );
            await this.rateLimiter.sleep(delay);
            continue;
          }
        }

        // Update token consumption
        const tokenCost = this.rateLimiter.calculateTokenCost(response.status);
        this.rateLimiter.consumeTokens(
          this.rateLimiter.getBucket(group, userID),
          tokenCost
        );

        return response;
      } catch (error) {
        lastError = error;

        // Don't retry on certain errors
        if (
          error.name === "AbortError" ||
          error.code === "RATE_LIMITER_CANCELLED"
        ) {
          throw error;
        }

        // Retry on network errors
        if (attempt < maxRetries) {
          const delay = this.calculateBackoffDelay(attempt);
          console.warn(
            `Request failed: ${error.message}. Retrying in ${delay}ms...`
          );
          await this.rateLimiter.sleep(delay);
          continue;
        }
      }
    }

    // If we get here, all retries failed
    throw lastError || new Error("Request failed after all retries");
  }

  /**
   * Queue a request for processing (respects rate limits)
   * @param {string} url - Request URL
   * @param {Object} options - Fetch options
   * @param {Object} config - Additional configuration
   * @returns {Promise<Response>} HTTP response
   */
  async queueFetch(url, options = {}, config = {}) {
    const group = this.extractRateLimitGroup(url);
    const userID = this.generateUserID(options, config.characterHash);

    return this.rateLimiter.queueRequest(
      () => this.fetch(url, options, config),
      [],
      group,
      userID
    );
  }

  /**
   * Get current rate limit status
   * @param {string} group - Rate limit group
   * @param {string} userID - User identifier
   * @returns {Object} Rate limit status
   */
  getRateLimitStatus(group, userID) {
    return this.rateLimiter.getStatus(group, userID);
  }

  /**
   * Get rate limit status for all buckets
   * @returns {Array} Array of rate limit statuses
   */
  getAllRateLimitStatuses() {
    const statuses = [];
    for (const [key, bucket] of this.rateLimiter.buckets) {
      statuses.push(this.rateLimiter.getStatus(bucket.group, bucket.userID));
    }
    return statuses;
  }

  /**
   * Clear all rate limit data
   */
  clearRateLimits() {
    this.rateLimiter.clear();
  }

  /**
   * Set custom rate limits for a group
   * @param {string} group - Rate limit group
   * @param {number} maxTokens - Maximum tokens
   * @param {number} windowSize - Window size in milliseconds
   */
  setRateLimit(group, maxTokens, windowSize) {
    this.rateLimiter.defaultLimits[group] = { maxTokens, windowSize };
  }

  /**
   * Check if a group is disabled
   * @param {string} group - Rate limit group to check
   * @returns {boolean} True if group is disabled
   */
  isGroupDisabled(group) {
    return this.rateLimiter.isGroupDisabled(group);
  }
}

// Create a singleton instance
const esiFetchWrapper = new ESIFetchWrapper();

export default esiFetchWrapper;

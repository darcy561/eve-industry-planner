/**
 * ESI Rate Limiter - Implements EVE Online's floating window rate limiting system
 * Based on: https://developers.eveonline.com/docs/services/esi/rate-limiting/
 */

import { ESI_RATE_LIMIT_GROUPS } from "../../../Context/defaultValues.jsx";

class ESIRateLimiter {
  constructor() {
    // Track rate limit buckets by group and userID
    this.buckets = new Map();
    this.requestQueue = [];
    this.isProcessing = false;

    // Initialize disabled groups from configuration
    this.disabledGroups = new Set();
    this.defaultLimits = {};

    // Load configuration from ESI_RATE_LIMIT_GROUPS
    Object.values(ESI_RATE_LIMIT_GROUPS).forEach((group) => {
      if (group.disabled) {
        this.disabledGroups.add(group.name);
      }
      this.defaultLimits[group.name] = {
        maxTokens: group.maxTokens,
        windowSize: group.windowSize,
      };
    });
  }

  /**
   * Get or create a rate limit bucket for a specific group and userID
   * @param {string} group - Rate limit group (e.g., 'market', 'character')
   * @param {string} userID - User identifier (applicationID:characterID or sourceIP)
   * @returns {Object} Bucket object
   */
  getBucket(group, userID) {
    const key = `${group}:${userID}`;

    if (!this.buckets.has(key)) {
      const limits = this.defaultLimits[group] ||
        this.defaultLimits.default || {
          maxTokens: 150, // Safe default fallback
          windowSize: 15 * 60 * 1000, // 15 minutes
        };
      this.buckets.set(key, {
        group,
        userID,
        maxTokens: limits.maxTokens,
        windowSize: limits.windowSize,
        tokens: limits.maxTokens,
        tokenConsumption: [],
        lastUpdated: Date.now(),
      });
    }

    return this.buckets.get(key);
  }

  /**
   * Update bucket limits from ESI response headers
   * @param {string} group - Rate limit group
   * @param {string} userID - User identifier
   * @param {Object} headers - Response headers
   */
  updateBucketFromHeaders(group, userID, headers) {
    const bucket = this.getBucket(group, userID);

    // Parse rate limit headers
    const limitHeader = headers.get("X-Ratelimit-Limit");
    const remainingHeader = headers.get("X-Ratelimit-Remaining");
    const usedHeader = headers.get("X-Ratelimit-Used");

    if (limitHeader) {
      const [maxTokens, windowStr] = limitHeader.split("/");
      const windowSize = this.parseWindowSize(windowStr);

      bucket.maxTokens = parseInt(maxTokens, 10);
      bucket.windowSize = windowSize;
    }

    if (remainingHeader !== null) {
      bucket.tokens = parseInt(remainingHeader, 10);
    }

    if (usedHeader) {
      const tokensUsed = parseInt(usedHeader, 10);
      this.consumeTokens(bucket, tokensUsed);
    }
  }

  /**
   * Parse window size string (e.g., "15m", "1h")
   * @param {string} windowStr - Window size string
   * @returns {number} Window size in milliseconds
   */
  parseWindowSize(windowStr) {
    const match = windowStr.match(/(\d+)([mh])/);
    if (!match) return 15 * 60 * 1000; // Default 15 minutes

    const value = parseInt(match[1], 10);
    const unit = match[2];

    return unit === "h" ? value * 60 * 60 * 1000 : value * 60 * 1000;
  }

  /**
   * Consume tokens from a bucket
   * @param {Object} bucket - Rate limit bucket
   * @param {number} tokens - Number of tokens to consume
   */
  consumeTokens(bucket, tokens) {
    const now = Date.now();

    // Clean up old token consumption records
    this.cleanupTokenConsumption(bucket, now);

    // Record token consumption
    bucket.tokenConsumption.push({
      tokens,
      timestamp: now,
    });

    // Update available tokens
    bucket.tokens = Math.max(0, bucket.tokens - tokens);
    bucket.lastUpdated = now;
  }

  /**
   * Clean up old token consumption records based on floating window
   * @param {Object} bucket - Rate limit bucket
   * @param {number} now - Current timestamp
   */
  cleanupTokenConsumption(bucket, now) {
    const cutoffTime = now - bucket.windowSize;

    // Remove old consumption records
    bucket.tokenConsumption = bucket.tokenConsumption.filter(
      (record) => record.timestamp > cutoffTime
    );

    // Recalculate available tokens
    const totalConsumed = bucket.tokenConsumption.reduce(
      (sum, record) => sum + record.tokens,
      0
    );

    bucket.tokens = Math.max(0, bucket.maxTokens - totalConsumed);
  }

  /**
   * Calculate token cost based on response status
   * @param {number} status - HTTP status code
   * @returns {number} Token cost
   */
  calculateTokenCost(status) {
    if (status >= 200 && status < 300) return 2; // 2XX responses
    if (status >= 300 && status < 400) return 1; // 3XX responses
    if (status >= 400 && status < 500) return 5; // 4XX responses
    return 0; // 5XX responses (server errors)
  }

  /**
   * Check if a request can be made without hitting rate limits
   * @param {string} group - Rate limit group
   * @param {string} userID - User identifier
   * @param {number} requiredTokens - Tokens required for the request
   * @returns {Object} Check result with canProceed and waitTime
   */
  canMakeRequest(group, userID, requiredTokens = 2) {
    // Check if group is disabled
    if (this.isGroupDisabled(group)) {
      return { canProceed: true, waitTime: 0 };
    }

    const bucket = this.getBucket(group, userID);
    const now = Date.now();

    // Clean up old records
    this.cleanupTokenConsumption(bucket, now);

    if (bucket.tokens >= requiredTokens) {
      return { canProceed: true, waitTime: 0 };
    }

    // Calculate when enough tokens will be available
    const oldestConsumption = bucket.tokenConsumption[0];
    if (!oldestConsumption) {
      return { canProceed: true, waitTime: 0 };
    }

    const waitTime = oldestConsumption.timestamp + bucket.windowSize - now;
    return { canProceed: false, waitTime: Math.max(0, waitTime) };
  }

  /**
   * Queue a request for processing
   * @param {Function} requestFn - Function to execute
   * @param {Array} args - Arguments for the function
   * @param {string} group - Rate limit group
   * @param {string} userID - User identifier
   * @returns {Promise} Promise that resolves when request is processed
   */
  async queueRequest(requestFn, args, group, userID) {
    return new Promise((resolve, reject) => {
      this.requestQueue.push({
        requestFn,
        args,
        group,
        userID,
        resolve,
        reject,
        timestamp: Date.now(),
      });

      this.processQueue();
    });
  }

  /**
   * Process the request queue
   */
  async processQueue() {
    if (this.isProcessing || this.requestQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    while (this.requestQueue.length > 0) {
      const request = this.requestQueue[0];
      const { group, userID } = request;

      // Check if we can make the request
      const canMake = this.canMakeRequest(group, userID);

      if (!canMake.canProceed) {
        // Wait for the required time
        await this.sleep(canMake.waitTime);
        continue;
      }

      // Remove from queue and process
      this.requestQueue.shift();

      try {
        const result = await request.requestFn(...request.args);
        request.resolve(result);
      } catch (error) {
        request.reject(error);
      }
    }

    this.isProcessing = false;
  }

  /**
   * Sleep for a specified number of milliseconds
   * @param {number} ms - Milliseconds to sleep
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Check if a group is disabled
   * @param {string} group - Rate limit group to check
   * @returns {boolean} True if group is disabled
   */
  isGroupDisabled(group) {
    return this.disabledGroups.has(group);
  }

  /**
   * Get current rate limit status for a bucket
   * @param {string} group - Rate limit group
   * @param {string} userID - User identifier
   * @returns {Object} Current status
   */
  getStatus(group, userID) {
    const bucket = this.getBucket(group, userID);
    if (!bucket) {
      return {
        group,
        userID,
        maxTokens: 150,
        availableTokens: 150,
        windowSize: 15 * 60 * 1000,
        lastUpdated: Date.now(),
      };
    }

    const now = Date.now();

    this.cleanupTokenConsumption(bucket, now);

    return {
      group: bucket.group,
      userID: bucket.userID,
      maxTokens: bucket.maxTokens || 150,
      availableTokens: bucket.tokens || 150,
      windowSize: bucket.windowSize || 15 * 60 * 1000,
      lastUpdated: bucket.lastUpdated || now,
    };
  }

  /**
   * Clear all rate limit data (useful for testing)
   */
  clear() {
    this.buckets.clear();
    this.requestQueue = [];
    this.isProcessing = false;
  }
}

export default ESIRateLimiter;

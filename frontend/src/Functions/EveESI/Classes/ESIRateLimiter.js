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

    // Dynamic group discovery - map paths to discovered groups
    // Note: Group is the same for a path regardless of userID (per ESI spec)
    // But each (group, userID) pair gets its own bucket
    this.pathToGroup = new Map(); // path -> group name (shared across all userIDs)
    
    // Initialise disabled groups from configuration (if any)
    this.disabledGroups = new Set();
    
    // Default limits for unknown groups (will be updated from headers)
    this.defaultLimits = {
      default: {
        maxTokens: 150, // Safe default fallback
        windowSize: 15 * 60 * 1000, // 15 minutes
      }
    };

    // Load disabled groups from configuration if they exist
    if (ESI_RATE_LIMIT_GROUPS) {
      Object.values(ESI_RATE_LIMIT_GROUPS).forEach((group) => {
        if (group.disabled) {
          this.disabledGroups.add(group.name);
        }
        // Store as fallback defaults, but will be overridden by headers
        if (group.maxTokens && group.windowSize) {
          this.defaultLimits[group.name] = {
            maxTokens: group.maxTokens,
            windowSize: group.windowSize,
          };
        }
      });
    }
  }

  /**
   * Get or create a rate limit bucket for a specific group and userID
   * Dynamically creates buckets for any group (no need to pre-configure)
   * @param {string} group - Rate limit group (e.g., 'market', 'character', or dynamically discovered)
   * @param {string} userID - User identifier (applicationID:characterID or sourceIP)
   * @returns {Object} Bucket object
   */
  getBucket(group, userID) {
    const key = `${group}:${userID}`;

    if (!this.buckets.has(key)) {
      // Use default limits for this group if available, otherwise use safe defaults
      const limits = this.defaultLimits[group] || this.defaultLimits.default || {
        maxTokens: 150, // Safe default fallback
        windowSize: 15 * 60 * 1000, // 15 minutes
      };
      
      this.buckets.set(key, {
        group,
        userID,
        maxTokens: limits.maxTokens,
        windowSize: limits.windowSize,
        tokens: limits.maxTokens, // Start with full tokens
        tokenConsumption: [],
        lastUpdated: Date.now(),
      });
    }

    return this.buckets.get(key);
  }

  /**
   * Extract group name from X-Ratelimit-Group header
   * @param {Headers} headers - Response headers
   * @returns {string|null} Group name or null if not present
   */
  extractGroupFromHeaders(headers) {
    const groupHeader = headers.get("X-Ratelimit-Group");
    return groupHeader || null;
  }

  /**
   * Parse token limit from X-Ratelimit-Limit header (format: "150/15m" or "600/15m")
   * @param {string} limitStr - Limit header value
   * @returns {Object|null} Object with maxTokens and windowSize, or null if parsing fails
   */
  parseTokenLimitFromHeader(limitStr) {
    if (!limitStr) return null;
    
    const parts = limitStr.split("/");
    if (parts.length < 2) return null;
    
    const maxTokens = parseInt(parts[0].trim(), 10);
    if (isNaN(maxTokens)) return null;
    
    const windowSize = this.parseWindowSize(parts[1].trim());
    
    return { maxTokens, windowSize };
  }

  /**
   * Update bucket limits from ESI response headers and discover group dynamically
   * @param {string} url - Request URL (for path-to-group mapping)
   * @param {string} initialGroup - Initial group (from cache or 'default')
   * @param {string} userID - User identifier
   * @param {Headers} headers - Response headers
   * @returns {string} Actual group name (from headers or initialGroup)
   */
  updateBucketFromHeaders(url, initialGroup, userID, headers) {
    // Extract actual group from headers (dynamic discovery)
    const headerGroup = this.extractGroupFromHeaders(headers);
    const actualGroup = headerGroup || initialGroup;
    
    // Map path to discovered group for future requests (only if we got a group from headers)
    if (headerGroup) {
      this.pathToGroup.set(url, headerGroup);
    }
    
    // Get or create bucket for the actual group
    const bucket = this.getBucket(actualGroup, userID);

    // Parse rate limit headers
    const limitHeader = headers.get("X-Ratelimit-Limit");
    const remainingHeader = headers.get("X-Ratelimit-Remaining");
    const usedHeader = headers.get("X-Ratelimit-Used");

    // Update limits from headers if available
    if (limitHeader) {
      const parsed = this.parseTokenLimitFromHeader(limitHeader);
      if (parsed) {
        bucket.maxTokens = parsed.maxTokens;
        bucket.windowSize = parsed.windowSize;
        
        // Update default limits for this group for future use
        this.defaultLimits[actualGroup] = {
          maxTokens: parsed.maxTokens,
          windowSize: parsed.windowSize,
        };
      }
    }

    // Update token counts from headers (server is source of truth)
    if (remainingHeader !== null) {
      const remaining = parseInt(remainingHeader, 10);
      if (!isNaN(remaining)) {
        // Calculate used tokens from remaining
        bucket.tokens = remaining;
      }
    }

    if (usedHeader) {
      const tokensUsed = parseInt(usedHeader, 10);
      if (!isNaN(tokensUsed)) {
        // Track consumption for floating window calculation
        this.consumeTokens(bucket, 0); // Cleanup old records
        // Update tokens based on server's used count
        bucket.tokens = bucket.maxTokens - tokensUsed;
      }
    }
    
    return actualGroup;
  }

  /**
   * Get group for a URL (from cache or return default)
   * @param {string} url - Request URL
   * @param {string} fallbackGroup - Fallback group if not cached
   * @returns {string} Group name
   */
  getGroupForUrl(url, fallbackGroup = 'default') {
    return this.pathToGroup.get(url) || fallbackGroup;
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
   * @param {string} group - Initial rate limit group (may be updated from headers)
   * @param {string} userID - User identifier
   * @param {string} [url] - Optional URL for path-to-group mapping
   * @returns {Promise} Promise that resolves when request is processed
   */
  async queueRequest(requestFn, args, group, userID, url = null) {
    // If URL provided, check if we have a cached group for it
    let actualGroup = group;
    if (url) {
      const cachedGroup = this.getGroupForUrl(url, group);
      actualGroup = cachedGroup;
    }
    
    return new Promise((resolve, reject) => {
      this.requestQueue.push({
        requestFn,
        args,
        group: actualGroup, // Use cached group if available
        userID,
        url, // Store URL for group discovery
        resolve,
        reject,
        timestamp: Date.now(),
      });

      this.processQueue();
    });
  }

  /**
   * Process the request queue with parallel execution support
   */
  async processQueue() {
    if (this.isProcessing || this.requestQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    try {
      // Group requests by (group, userID) to process them in parallel batches
      const requestGroups = new Map();
      
      // Organise requests by group and userID
      for (const request of this.requestQueue) {
        const key = `${request.group}:${request.userID}`;
        if (!requestGroups.has(key)) {
          requestGroups.set(key, []);
        }
        requestGroups.get(key).push(request);
      }

      // Process all groups in parallel
      const processingPromises = [];
      
      for (const [key, requests] of requestGroups) {
        processingPromises.push(this.processRequestGroup(requests));
      }

      // Wait for all groups to process
      await Promise.allSettled(processingPromises);
      
      // Remove processed requests from the main queue
      this.requestQueue = this.requestQueue.filter(req => 
        !req.processed
      );

      // If there are still requests, process again
      if (this.requestQueue.length > 0) {
        // Use setImmediate or setTimeout to allow other operations
        setTimeout(() => this.processQueue(), 0);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process a group of requests for the same (group, userID) in parallel
   * Each bucket has its own token pool and rate limit - no artificial concurrency cap
   * @param {Array} requests - Array of request objects with same group and userID
   */
  async processRequestGroup(requests) {
    if (requests.length === 0) return;

    const { group, userID } = requests[0];
    const activePromises = new Set();

    while (requests.length > 0 || activePromises.size > 0) {
      // Start new requests as long as we have tokens available (no artificial concurrency limit)
      let startedNewRequest = false;
      
      while (requests.length > 0) {
        const request = requests.shift();
        const canMake = this.canMakeRequest(group, userID);

        if (!canMake.canProceed) {
          // Put request back at the front and wait
          requests.unshift(request);
          if (canMake.waitTime > 0) {
            await this.sleep(Math.min(canMake.waitTime, 100)); // Wait max 100ms at a time
          }
          break;
        }

        // Mark as processed and start the request
        // Token availability is the only limiting factor - each bucket manages its own tokens
        request.processed = true;
        const promise = this.executeRequest(request, group, userID)
          .finally(() => {
            activePromises.delete(promise);
          });
        
        activePromises.add(promise);
        startedNewRequest = true;
      }

      // Wait for at least one request to complete if we have pending requests
      if (activePromises.size > 0 && requests.length > 0) {
        // Wait for a request to complete so tokens can be recovered
        await Promise.race(Array.from(activePromises));
      } else if (activePromises.size > 0 && requests.length === 0) {
        // Wait for remaining requests to complete
        await Promise.allSettled(Array.from(activePromises));
      } else if (requests.length > 0 && !startedNewRequest) {
        // Small delay to allow token recovery if we couldn't start any requests
        await this.sleep(10);
      }
    }
  }

  /**
   * Execute a single request and handle token consumption
   * @param {Object} request - Request object
   * @param {string} group - Initial rate limit group
   * @param {string} userID - User identifier
   */
  async executeRequest(request, group, userID) {
    try {
      // Reserve tokens before making request (optimistic)
      const bucket = this.getBucket(group, userID);
      const requiredTokens = 2; // Default token cost
      
      // Consume tokens optimistically
      this.consumeTokens(bucket, requiredTokens);
      
      const result = await request.requestFn(...request.args);
      
      // Update tokens from response headers and discover actual group
      if (result && result.headers && request.url) {
        const actualGroup = this.updateBucketFromHeaders(
          request.url,
          group,
          userID,
          result.headers
        );
        
        // If group changed, update the bucket reference
        if (actualGroup !== group) {
          const actualBucket = this.getBucket(actualGroup, userID);
          // Update token count from headers
          const remainingHeader = result.headers.get("X-Ratelimit-Remaining");
          if (remainingHeader !== null) {
            const remaining = parseInt(remainingHeader, 10);
            if (!isNaN(remaining)) {
              actualBucket.tokens = remaining;
            }
          }
        }
      }
      
      request.resolve(result);
    } catch (error) {
      request.reject(error);
    }
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

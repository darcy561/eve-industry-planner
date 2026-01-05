/**
 * Rate Limiter Class for controlling API request frequency.
 * 
 * This class provides sophisticated rate limiting capabilities:
 * - Controls concurrent request execution
 * - Implements delay-based rate limiting
 * - Supports request cancellation and abort signals
 * - Provides queue management for pending requests
 * - Handles cancellation gracefully with proper error propagation
 * 
 * @class RateLimiter
 */
class RateLimiter {
  /**
   * Creates a new RateLimiter instance.
   * 
   * @param {number} limit - Maximum number of concurrent requests
   * @param {number} interval - Time interval in milliseconds for rate limiting
   */
  constructor(limit, interval) {
    this.limit = limit;
    this.delay = interval / limit;
    this.queue = [];
    this.activeRequests = 0;
    this.isRunning = false;
    this.isCancelled = false;
    this.abortController = new AbortController(); // Internal AbortController
  }

  /**
   * Gets the abort signal for HTTP requests.
   * 
   * This method provides an AbortSignal that can be used to cancel HTTP requests:
   * - Returns the internal AbortController's signal
   * - Used to cancel requests when rate limiter is cancelled
   * - Enables proper cleanup of ongoing HTTP operations
   * 
   * @returns {AbortSignal} Abort signal for HTTP requests
   * 
   * @example
   * const signal = rateLimiter.getAbortSignal();
   * fetch(url, { signal });
   */
  getAbortSignal() {
    return this.abortController.signal;
  }

  /**
   * Cancels all queued requests and rejects them.
   * 
   * This method provides graceful cancellation of all pending operations:
   * - Sets cancellation flag to prevent new operations
   * - Aborts all HTTP requests using AbortController
   * - Rejects all queued promises with cancellation error
   * - Stops the processing loop
   * 
   * @param {string} [reason="RATE_LIMITER_CANCELLED"] - Reason for cancellation
   * @returns {void}
   * 
   * @example
   * rateLimiter.cancel("User requested stop");
   */
  cancel(reason = "RATE_LIMITER_CANCELLED") {
    this.isCancelled = true;
    
    // Abort all HTTP requests
    this.abortController.abort();
    
    // Reject all queued promises
    while (this.queue.length > 0) {
      const { reject } = this.queue.shift();
      const error = new Error(reason);
      error.code = 'RATE_LIMITER_CANCELLED';
      error.isCancelled = true;
      reject(error);
    }
    
    // Stop processing
    this.isRunning = false;
  }

  /**
   * Checks if the rate limiter has been cancelled.
   * 
   * @returns {boolean} True if cancelled, false otherwise
   */
  getCancelledStatus() {
    return this.isCancelled;
  }

  /**
   * Processes the request queue with rate limiting.
   * 
   * This method manages the execution of queued requests:
   * - Processes requests sequentially up to the limit
   * - Implements delay between requests for rate limiting
   * - Handles cancellation gracefully
   * - Manages active request count
   * 
   * @returns {Promise<void>} Resolves when queue processing is complete
   * @private
   */
  async processQueue() {
    if (this.isRunning || this.isCancelled) return;
    this.isRunning = true;

    while (this.queue.length > 0 && !this.isCancelled) {
      if (this.activeRequests >= this.limit) {
        await this.sleep(this.delay);
        continue;
      }

      const { fn, args, resolve, reject } = this.queue.shift();
      this.activeRequests++;

      try {
        // Check if cancelled before executing
        if (this.isCancelled) {
          const error = new Error("RATE_LIMITER_CANCELLED");
          error.code = 'RATE_LIMITER_CANCELLED';
          error.isCancelled = true;
          reject(error);
          this.activeRequests--;
          continue;
        }

        const result = await fn(...args);
        if (result instanceof Error) {
          throw result;
        }
        resolve(result);
      } catch (err) {
        reject(err);
      } finally {
        this.activeRequests--;
      }
      await this.sleep(this.delay);
    }
    this.isRunning = false;
  }

  /**
   * Enqueues a function for rate-limited execution.
   * 
   * This method adds functions to the rate-limited queue:
   * - Checks for cancellation before queuing
   * - Returns a promise that resolves with the function result
   * - Automatically starts queue processing
   * - Handles errors and cancellation gracefully
   * 
   * @param {Function} fn - Function to execute
   * @param {...any} args - Arguments to pass to the function
   * @returns {Promise<any>} Promise that resolves with function result
   * @throws {Error} Throws cancellation error if rate limiter is cancelled
   * 
   * @example
   * const result = await rateLimiter.enqueue(fetchData, url, options);
   */
  async enqueue(fn, ...args) {
    // Check if already cancelled
    if (this.isCancelled) {
      const error = new Error("RATE_LIMITER_CANCELLED");
      error.code = 'RATE_LIMITER_CANCELLED';
      error.isCancelled = true;
      return Promise.reject(error);
    }

    return new Promise((resolve, reject) => {
      this.queue.push({ fn, args, resolve, reject });
      this.processQueue();
    });
  }

  /**
   * Sleeps for the specified number of milliseconds.
   * 
   * @param {number} ms - Number of milliseconds to sleep
   * @returns {Promise<void>} Promise that resolves after the delay
   * @private
   */
  sleep(ms) {
    return new Promise((res) => setTimeout(res, ms));
  }
}

export default RateLimiter;

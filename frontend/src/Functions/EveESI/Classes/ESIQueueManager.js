/**
 * ESI Queue Manager - Manages queued requests with priority and batching
 * Provides advanced queue management for ESI requests with rate limiting
 */

import esiFetchWrapper from './ESIFetchWrapper.js';

class ESIQueueManager {
  constructor() {
    this.queues = new Map(); // Separate queues for different rate limit groups
    this.priorities = {
      'high': 1,
      'normal': 2,
      'low': 3
    };
    this.batchSizes = {
      'market': 10,
      'character': 5,
      'corporation': 5,
      'universe': 3,
      'default': 5
    };
    this.isProcessing = false;
  }

  /**
   * Add a request to the appropriate queue
   * @param {string} url - Request URL
   * @param {Object} options - Fetch options
   * @param {Object} config - Request configuration
   * @returns {Promise<Response>} HTTP response
   */
  async addRequest(url, options = {}, config = {}) {
    // Use 'default' group for queue organisation until group is discovered from headers
    // The actual rate limiting will use the discovered group dynamically
    const group = 'default';
    const priority = config.priority || 'normal';
    const batchable = config.batchable !== false; // Default to true
    const characterHash = config.characterHash || options.characterHash;
    
    
    const request = {
      url,
      options,
      config: {
        ...config,
        characterHash
      },
      priority,
      batchable,
      timestamp: Date.now(),
      resolve: null,
      reject: null
    };
    
    return new Promise((resolve, reject) => {
      request.resolve = resolve;
      request.reject = reject;
      
      this.enqueueRequest(group, request);
      this.processQueues();
    });
  }

  /**
   * Get rate limit group for URL (from cache or default)
   * Groups are discovered dynamically from X-Ratelimit-Group headers
   * @param {string} url - ESI endpoint URL
   * @returns {string} Rate limit group (from cache or 'default')
   */
  getGroupForUrl(url) {
    // Groups are discovered from headers and cached
    // For queue organisation, we use 'default' until group is discovered
    // The actual rate limiting will use the discovered group from headers
    return 'default';
  }

  /**
   * Enqueue a request in the appropriate queue
   * @param {string} group - Rate limit group
   * @param {Object} request - Request object
   */
  enqueueRequest(group, request) {
    if (!this.queues.has(group)) {
      this.queues.set(group, {
        requests: [],
        processing: false,
        lastProcessed: 0
      });
    }
    
    const queue = this.queues.get(group);
    queue.requests.push(request);
    
    // Sort by priority and timestamp
    queue.requests.sort((a, b) => {
      const priorityDiff = this.priorities[a.priority] - this.priorities[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return a.timestamp - b.timestamp;
    });
  }

  /**
   * Process all queues
   */
  async processQueues() {
    if (this.isProcessing) return;
    
    this.isProcessing = true;
    
    try {
      // Process each queue
      for (const [group, queue] of this.queues) {
        if (queue.requests.length > 0 && !queue.processing) {
          await this.processQueue(group, queue);
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process a specific queue
   * @param {string} group - Rate limit group
   * @param {Object} queue - Queue object
   */
  async processQueue(group, queue) {
    if (queue.processing || queue.requests.length === 0) return;
    
    queue.processing = true;
    
    try {
      const batchSize = this.batchSizes[group] || this.batchSizes.default;
      
      // Process non-batchable requests first
      const nonBatchableRequests = queue.requests.filter(req => !req.batchable);
      
      for (const request of nonBatchableRequests) {
        await this.processSingleRequest(request);
        // Remove the processed request from the queue
        const index = queue.requests.indexOf(request);
        if (index > -1) {
          queue.requests.splice(index, 1);
        }
      }
      
      // Process batchable requests in batches
      while (queue.requests.length > 0) {
        const batchableRequests = queue.requests.filter(req => req.batchable);
        if (batchableRequests.length === 0) break;
        
        const batch = batchableRequests.slice(0, batchSize);
        await this.processBatch(batch);
        
        // Remove processed requests from queue
        batch.forEach(request => {
          const index = queue.requests.indexOf(request);
          if (index > -1) {
            queue.requests.splice(index, 1);
          }
        });
        
        // Add delay between batches to respect rate limits
        if (queue.requests.length > 0) {
          await this.delay(100); // 100ms delay between batches
        }
      }
      
    } finally {
      queue.processing = false;
      queue.lastProcessed = Date.now();
    }
  }

  /**
   * Process a single request
   * Group will be discovered dynamically from X-Ratelimit-Group header
   * @param {Object} request - Request object
   */
  async processSingleRequest(request) {
    try {
      // Use group from config if provided, otherwise will be discovered from headers
      const configWithUrl = {
        ...request.config,
        url: request.url // Pass URL for path-to-group mapping
      };
      
      const response = await esiFetchWrapper.fetch(
        request.url,
        request.options,
        configWithUrl
      );
      request.resolve(response);
    } catch (error) {
      request.reject(error);
    }
  }

  /**
   * Process a batch of requests
   * @param {Array} batch - Array of request objects
   */
  async processBatch(batch) {
    const promises = batch.map(request => 
      this.processSingleRequest(request)
    );
    
    // Wait for all requests in the batch to complete
    await Promise.allSettled(promises);
  }

  /**
   * Delay execution
   * @param {number} ms - Milliseconds to delay
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get queue status for a specific group
   * @param {string} group - Rate limit group
   * @returns {Object} Queue status
   */
  getQueueStatus(group) {
    const queue = this.queues.get(group);
    if (!queue) return { pending: 0, processing: false };
    
    return {
      pending: queue.requests.length,
      processing: queue.processing,
      lastProcessed: queue.lastProcessed
    };
  }

  /**
   * Get status for all queues
   * @returns {Object} All queue statuses
   */
  getAllQueueStatuses() {
    const statuses = {};
    for (const [group, queue] of this.queues) {
      statuses[group] = this.getQueueStatus(group);
    }
    return statuses;
  }

  /**
   * Clear a specific queue
   * @param {string} group - Rate limit group
   */
  clearQueue(group) {
    const queue = this.queues.get(group);
    if (queue) {
      // Reject all pending requests
      queue.requests.forEach(request => {
        request.reject(new Error('Queue cleared'));
      });
      queue.requests = [];
    }
  }

  /**
   * Clear all queues
   */
  clearAllQueues() {
    for (const [group, queue] of this.queues) {
      queue.requests.forEach(request => {
        request.reject(new Error('All queues cleared'));
      });
      queue.requests = [];
    }
    this.queues.clear();
  }

  /**
   * Set batch size for a specific group
   * @param {string} group - Rate limit group
   * @param {number} size - Batch size
   */
  setBatchSize(group, size) {
    this.batchSizes[group] = size;
  }

  /**
   * Set priority for a request
   * @param {string} priority - Priority level ('high', 'normal', 'low')
   */
  setPriority(priority) {
    if (this.priorities.hasOwnProperty(priority)) {
      return this.priorities[priority];
    }
    return this.priorities.normal;
  }

  /**
   * Get queue statistics
   * @returns {Object} Queue statistics
   */
  getStatistics() {
    const stats = {
      totalQueues: this.queues.size,
      totalPending: 0,
      totalProcessing: 0,
      queues: {}
    };
    
    for (const [group, queue] of this.queues) {
      const queueStats = {
        pending: queue.requests.length,
        processing: queue.processing,
        lastProcessed: queue.lastProcessed,
        priorities: {}
      };
      
      // Count requests by priority
      queue.requests.forEach(request => {
        if (!queueStats.priorities[request.priority]) {
          queueStats.priorities[request.priority] = 0;
        }
        queueStats.priorities[request.priority]++;
      });
      
      stats.queues[group] = queueStats;
      stats.totalPending += queue.requests.length;
      if (queue.processing) stats.totalProcessing++;
    }
    
    return stats;
  }
}

// Create a singleton instance
const esiQueueManager = new ESIQueueManager();

export default esiQueueManager;

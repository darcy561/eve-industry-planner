import { warn, debug } from "firebase-functions/logger";
import RateLimiter from "./rateLimiter.js";
import { EventEmitter } from "events";

/**
 * Event Manager Class for coordinating asynchronous task execution with rate limiting.
 * 
 * This class provides sophisticated task management capabilities:
 * - Coordinates execution of multiple tasks with rate limiting
 * - Tracks task completion, failures, and incomplete tasks
 * - Implements execution time limits with graceful cleanup
 * - Provides comprehensive statistics and monitoring
 * - Handles task cancellation and abort signals
 * - Uses EventEmitter for asynchronous coordination
 * - Prevents duplicate task processing
 * 
 * @class EventManager
 */
class EventManager {
  /**
   * Creates a new EventManager instance.
   * 
   * @param {Array<any>} inputIDs - Array of task IDs to process
   * @param {Function} requestFunction - Function to execute for each task
   * @param {Function} processFunction - Function to process task results
   * @param {number} [rateLimit=3] - Maximum concurrent requests
   * @param {number} [interval=1000] - Rate limiting interval in milliseconds
   * @param {number} [maxRunTimeSeconds=0] - Maximum execution time in seconds (0 = no limit)
   */
  constructor(
    inputIDs,
    requestFunction,
    processFunction,
    rateLimit = 3,
    interval = 1000,
    maxRunTimeSeconds = 0
  ) {
    // Check for duplicates and log if found
    const uniqueIDs = [...new Set(inputIDs)];
    if (uniqueIDs.length !== inputIDs.length) {
      warn(`Duplicate typeIDs detected: ${inputIDs.length} input, ${uniqueIDs.length} unique`);
    }
    
    this.tasks = inputIDs;
    this.requestFunction = requestFunction;
    this.processFunction = processFunction;
    this.rateLimiter = new RateLimiter(rateLimit, interval);
    this.emitter = new EventEmitter();
    this.completedTasks = [];
    this.totalTasks = inputIDs.length;
    this.processedTasks = 0;
    this.failedTasks = [];
    this.incompleteTasks = [];
    this.activeTasks = new Set(); // Track active tasks
    this.completedTaskIds = new Set(); // Track completed task IDs
    this.processedTaskIds = new Set(); // Track processed task IDs to prevent double-counting
    this.cleanUpPeriod = 30000; // 30 seconds
    this.cleanUpStarted = false;
    this.executionStartTime = Date.now();
    this.executionEndTime = maxRunTimeSeconds === 0 ? 0 : this.executionStartTime + maxRunTimeSeconds * 1000 - this.cleanUpPeriod;
    this.executionEndTimeReached = false;
    this.executionCheckInterval = null; // For periodic execution time checks
  }

  /**
   * Gets the abort signal for HTTP requests.
   * 
   * @returns {AbortSignal} Abort signal for HTTP requests
   */
  getAbortSignal() {
    return this.rateLimiter.getAbortSignal();
  }

  /**
   * Checks if execution end time has been reached.
   * 
   * @returns {boolean} True if execution time limit has been reached
   */
  hasExecutionEndTimeReached() {
    if (this.executionEndTime === 0) return false; // No time limit set
    return Date.now() >= this.executionEndTime;
  }

  /**
   * Checks if all tasks are complete (processed and finalized).
   * 
   * @returns {boolean} True if all tasks have been processed and finalized
   */
  areAllTasksComplete() {
    return this.processedTasks >= this.totalTasks && 
           this.completedTasks.length + this.failedTasks.length + this.incompleteTasks.length >= this.totalTasks;
  }

  /**
   * Gets comprehensive execution statistics.
   * 
   * @returns {Object} Execution statistics object
   */
  getExecutionStats() {
    const stats = {
      totalTasks: this.totalTasks,
      processedTasks: this.processedTasks,
      completedTasks: this.completedTasks.length,
      completedTaskIds: this.completedTaskIds.size,
      processedTaskIds: this.processedTaskIds.size,
      failedTasks: this.failedTasks.length,
      incompleteTasks: this.incompleteTasks.length,
      activeTasks: this.activeTasks.size,
      rateLimiterCancelled: this.rateLimiter.getCancelledStatus(),
      rateLimiterQueueLength: this.rateLimiter.queue.length,
      executionEndTimeReached: this.executionEndTimeReached,
      executionStartTime: this.executionStartTime,
      executionEndTime: this.executionEndTime,
      currentTime: Date.now()
    };
    
    // Debug information to help identify missing tasks
    if (stats.completedTasks !== stats.completedTaskIds) {
      warn(`Mismatch detected: completedTasks=${stats.completedTasks}, completedTaskIds=${stats.completedTaskIds}`);
    }
    
    if (stats.processedTasks !== stats.processedTaskIds) {
      warn(`Processed tasks mismatch: processedTasks=${stats.processedTasks}, processedTaskIds=${stats.processedTaskIds}`);
    }
    
    if (stats.processedTasks !== (stats.completedTasks + stats.failedTasks + stats.incompleteTasks)) {
      warn(`Task count mismatch: processedTasks=${stats.processedTasks}, sum=${stats.completedTasks + stats.failedTasks + stats.incompleteTasks}`);
    }
    
    return stats;
  }

  /**
   * Gets incomplete tasks for potential retry.
   * 
   * @returns {Array<any>} Array of incomplete task IDs
   */
  getIncompleteTasks() {
    return [...this.incompleteTasks];
  }

  /**
   * Starts periodic execution time checking.
   * 
   * @returns {void}
   */
  startExecutionTimeCheck() {
    if (this.executionEndTime === 0) return; // No time limit set
    
    this.executionCheckInterval = setInterval(() => {
      if (this.hasExecutionEndTimeReached() && !this.executionEndTimeReached) {
        this.handleExecutionTimeReached();
      }
    }, 1000); // Check every second
  }

  /**
   * Stops periodic execution time checking.
   * 
   * @returns {void}
   */
  stopExecutionTimeCheck() {
    if (this.executionCheckInterval) {
      clearInterval(this.executionCheckInterval);
      this.executionCheckInterval = null;
    }
  }

  /**
   * Handles execution time reached event.
   * 
   * @returns {void}
   */
  handleExecutionTimeReached() {
    this.executionEndTimeReached = true;
    const stats = this.getExecutionStats();
    warn(`Execution end time reached. Stopping task processing. Stats: ${JSON.stringify(stats)}`);
    
    // Cancel the rate limiter - this will automatically abort HTTP requests
    this.rateLimiter.cancel("EXECUTION_TIMEOUT");
    
    // Add remaining tasks to incomplete
    const remainingTasks = this.tasks.filter(task => 
      !this.activeTasks.has(task) && 
      !this.completedTaskIds.has(task) &&
      !this.processedTaskIds.has(task)
    );
    
    this.incompleteTasks.push(...remainingTasks);
    this.processedTasks += remainingTasks.length;
    
    // Add remaining tasks to processedTaskIds to prevent double-counting
    remainingTasks.forEach(task => this.processedTaskIds.add(task));
    
    // Emit completion if all tasks are now processed and complete
    if (this.areAllTasksComplete()) {
      this.emitter.emit("tasksComplete");
    }
  }

  /**
   * Runs the event manager to process all tasks.
   * 
   * @returns {Promise<Object>} Promise resolving to task results object
   */
  async run() {
    if (this.totalTasks === 0) {
      return {
        completed: this.completedTasks,
        failed: this.failedTasks,
        incomplete: this.incompleteTasks
      };
    }

    this.setupListeners();
    this.startExecutionTimeCheck();

    for (const task of this.tasks) {
      if (this.hasExecutionEndTimeReached()) {
        this.handleExecutionTimeReached();
        break;
      }
      this.makeRequest(task);
    }

    const result = await this.waitForAll();
    this.stopExecutionTimeCheck();
    return result;
  }

  /**
   * Sets up event listeners for task completion and error handling.
   * 
   * This method configures the EventEmitter listeners:
   * - Handles task completion events and processes results
   * - Manages error events and failed task tracking
   * - Prevents duplicate task processing with ID tracking
   * - Emits completion events when all tasks are finished
   * - Provides comprehensive debugging and logging
   * 
   * @returns {void}
   * @private
   */
  setupListeners() {
    this.emitter.on("completed", async (result) => {
      // Only increment processedTasks if this task hasn't been processed yet
      if (!this.processedTaskIds.has(result.typeID)) {
        this.processedTasks++;
        this.processedTaskIds.add(result.typeID);
      }

      if (result instanceof Error) {
        this.emitter.emit("error", result);
      } else {
        try {
          const processedResult = await this.processFunction(result);

          if (processedResult instanceof Error) {
            throw processedResult;
          }

          this.completedTasks.push(processedResult);
          this.completedTaskIds.add(processedResult.typeID); // Add completed task ID
          
          // Debug: Log completion
          debug(`Task completed: typeID=${processedResult.typeID}, completedCount=${this.completedTasks.length}, processedCount=${this.processedTasks}`);
        } catch (err) {
          this.emitter.emit("error", err);
        }
      }

      // Only emit tasksComplete when all tasks are truly complete
      if (this.areAllTasksComplete()) {
        this.emitter.emit("tasksComplete");
      }
    });

    this.emitter.on("beginCleanUp", () => {
      this.cleanUpStarted = true;
    });

    this.emitter.on("error", (err) => {
      // Only increment processedTasks if this task hasn't been processed yet
      if (!this.processedTaskIds.has(err.typeID)) {
        this.processedTasks++;
        this.processedTaskIds.add(err.typeID);
      }
      this.failedTasks.push(err);
      warn(err);
      
      // Check if all tasks are complete after adding a failed task
      if (this.areAllTasksComplete()) {
        this.emitter.emit("tasksComplete");
      }
    });
  }

  /**
   * Makes a request for a specific task using the rate limiter.
   * 
   * This method handles individual task execution:
   * - Checks execution time limits before processing
   * - Tracks active tasks and prevents duplicate processing
   * - Uses rate limiter for controlled request execution
   * - Handles cancellation and timeout scenarios gracefully
   * - Manages task completion and error events
   * - Provides comprehensive error handling for different failure types
   * 
   * @param {any} task - Task ID or data to process
   * @returns {Promise<void>} Resolves when task processing is complete
   * @private
   */
  async makeRequest(task) {
    // Check execution end time before making request
    if (this.hasExecutionEndTimeReached()) {
      if (!this.processedTaskIds.has(task)) {
        this.processedTasks++;
        this.processedTaskIds.add(task);
      }
      this.incompleteTasks.push(task);
      if (this.areAllTasksComplete()) {
        this.emitter.emit("tasksComplete");
      }
      return;
    }

    // Track this task as active
    this.activeTasks.add(task);

    try {
      const result = await this.requestFunction(task, this.rateLimiter);
      
      // Check if execution time was reached during the request
      if (this.hasExecutionEndTimeReached()) {
        if (!this.processedTaskIds.has(task)) {
          this.processedTasks++;
          this.processedTaskIds.add(task);
        }
        this.incompleteTasks.push(task);
      } else {
        this.emitter.emit("completed", result);
      }
    } catch (err) {
      // Check if the error is due to abort signal
      if (err.name === 'AbortError' || err.code === 'RATE_LIMITER_CANCELLED' || err.message === 'EXECUTION_TIMEOUT') {
        if (!this.processedTaskIds.has(task)) {
          this.processedTasks++;
          this.processedTaskIds.add(task);
        }
        this.incompleteTasks.push(task);
      } else if (this.hasExecutionEndTimeReached()) {
        if (!this.processedTaskIds.has(task)) {
          this.processedTasks++;
          this.processedTaskIds.add(task);
        }
        this.incompleteTasks.push(task);
      } else {
        this.emitter.emit("completed", err);
      }
    } finally {
      // Remove from active tasks
      this.activeTasks.delete(task);
      
      // Check if all tasks are now processed and complete
      if (this.areAllTasksComplete()) {
        this.emitter.emit("tasksComplete");
      }
    }
  }

  /**
   * Waits for all tasks to complete and returns the final results.
   * 
   * This method provides the completion coordination:
   * - Returns a promise that resolves when all tasks are complete
   * - Prevents multiple resolution attempts
   * - Provides comprehensive final statistics
   * - Returns structured results with completed, failed, and incomplete tasks
   * - Handles cleanup of event listeners
   * 
   * @returns {Promise<Object>} Promise resolving to task results object
   * @returns {Array<any>} returns.completed - Array of successfully completed tasks
   * @returns {Array<any>} returns.failed - Array of failed tasks
   * @returns {Array<any>} returns.incomplete - Array of incomplete tasks
   * @private
   */
  waitForAll() {
    return new Promise((resolve) => {
      let hasResolved = false;
      
      const resolveOnce = () => {
        if (!hasResolved) {
          hasResolved = true;
          this.emitter.removeListener("tasksComplete", resolveOnce);
          
          const results = {
            completed: this.completedTasks,
            failed: this.failedTasks,
            incomplete: this.incompleteTasks
          };
          
          // Debug: Log final counts
          debug(`waitForAll resolving - completed: ${results.completed.length}, failed: ${results.failed.length}, incomplete: ${results.incomplete.length}, total: ${results.completed.length + results.failed.length + results.incomplete.length}`);
          
          resolve(results);
        }
      };
      
      this.emitter.on("tasksComplete", resolveOnce);
    });
  }
}

export default EventManager;

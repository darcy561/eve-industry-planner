

import { log, error, debug } from "firebase-functions/logger";
import { ESI_TOKEN_GROUPS } from "./esi-token-groups.js";
import { getDatabase } from "firebase-admin/database";

/**
 * ESI Token Manager with Sliding Window Rate Limiting
 * Manages multiple token pools for different API endpoint groups
 * Each group has its own rate limit and 15-minute sliding window
 */
class ESITokenManager {
    /**
     * Initialize the ESI Token Manager
     * Sets up token pools and group configurations
     */
    constructor() {
        // Group-based token pools
        this.tokenPools = new Map(); // groupName -> TokenPool
        this.groupConfigs = new Map(); // groupName -> GroupConfig

        // Cleanup configuration
        this.cleanupInterval = 5 * 60 * 1000; // 5 minutes cleanup interval
        this.lastCleanup = Date.now();
    }

    /**
     * Configure token groups and restore state from database
     * Sets up token pools for each group and restores previous state
     * @async
     */
    async configureGroups() {
        Object.values(ESI_TOKEN_GROUPS).forEach(group => {
            debug(`Configuring group ${group.id} (${group.groupName}) with maxTokens: ${group.maxTokens}`);
            this.groupConfigs.set(group.id, group);
            this.tokenPools.set(group.id, {
                availableTokens: group.maxTokens,
                reservedTokens: 0,
                reservations: new Map(),
                lastRefill: Date.now(),
                usageHistory: [],
                windowStart: Date.now(),
            });
        });

        try {
            await this.restoreTokenPoolsFromDatabase();
            debug('Token groups configured and token usage restored from database');
        } catch (error) {
            debug('Failed to restore token pools from database, using defaults:', error);
        }

        // Log token pools with full reservation details
        for (const [groupId, pool] of this.tokenPools.entries()) {
            const reservations = Array.from(pool.reservations.entries()).map(([taskId, reservation]) => ({
                taskId,
                ...reservation
            }));

            debug(`Token Pool ${groupId}: availableTokens=${pool.availableTokens}, reservedTokens=${pool.reservedTokens}, reservations=${JSON.stringify(reservations)}, usageHistory=${JSON.stringify(pool.usageHistory)}, windowStart=${new Date(pool.windowStart).toISOString()}, lastRefill=${new Date(pool.lastRefill).toISOString()}`);
        }

        debug('Group Configs:', JSON.stringify(Object.fromEntries(this.groupConfigs.entries())));
    }


    /**
     * Request tokens for a specific group
     * @param {number} groupId - The group ID to request tokens from
     * @param {string} taskId - Unique identifier for the task
     * @param {number} requestedTokens - Number of tokens to request
     * @returns {Promise<Object>} Token reservation result
     * @async
     */
    async requestTokens(groupId, taskId, requestedTokens) {
        this.ensureGroupExists(groupId);
        this.performCleanup();

        const pool = this.tokenPools.get(groupId);
        const config = this.groupConfigs.get(groupId);

        // Refill tokens based on sliding window
        this.refillTokens(groupId);

        // Check if enough tokens are available
        if (requestedTokens <= pool.availableTokens) {
            // Reserve tokens
            pool.availableTokens -= requestedTokens;
            pool.reservedTokens += requestedTokens;
            pool.reservations.set(taskId, {
                requested: requestedTokens,
                confirmed: requestedTokens,
                used: 0,
                timestamp: Date.now(),
                groupId,
            });

            log(`Reserved ${requestedTokens} tokens for task ${taskId} in group ${groupId}`);

            return {
                status: "confirmed",
                taskId,
                groupId,
                confirmedTokens: requestedTokens,
                availableTokens: pool.availableTokens,
                reservedTokens: pool.reservedTokens,
                windowReset: pool.windowStart + config.windowSize,
                timestamp: new Date().toISOString(),
            };
        } else {
            // Not enough tokens available
            const timeUntilRefill = this.getTimeUntilNextRefill(groupId);

            log(`Insufficient tokens for task ${taskId} in group ${groupId}. Available: ${pool.availableTokens}, Requested: ${requestedTokens}`);

            return {
                status: "insufficient_tokens",
                taskId,
                groupId,
                requestedTokens,
                availableTokens: pool.availableTokens,
                reservedTokens: pool.reservedTokens,
                timeUntilRefill,
                message: `Only ${pool.availableTokens} tokens available in group ${groupId}, ${requestedTokens} requested`,
                timestamp: new Date().toISOString(),
            };
        }
    }

    /**
     * Complete token usage for a task (combines confirm and return)
     * @param {number} groupId - Group ID
     * @param {string} taskId - Task ID
     * @param {number} finalUsedTokens - Final number of tokens actually used
     * @param {number} [remainingTokensFromHeaders=0] - Remaining tokens from API headers
     * @param {boolean} [complete=true] - Whether to complete the task (true) or just confirm usage (false)
     * @returns {Promise<Object>} Completion result with status and token information
     * @async
     */
    async completeTokenUsage(groupId, taskId, finalUsedTokens, remainingTokensFromHeaders = 0, complete = true) {
        this.ensureGroupExists(groupId);

        const pool = this.tokenPools.get(groupId);

        if (!pool.reservations.has(taskId)) {
            throw new Error(`No token reservation found for task ${taskId} in group ${groupId}`);
        }

        const reservation = pool.reservations.get(taskId);
        const unusedTokens = Math.max(0, reservation.confirmed - finalUsedTokens);

        // Update reservation
        reservation.used = finalUsedTokens;

        if (complete) {
            try {
                // Return unused tokens to available pool
                pool.reservedTokens -= reservation.confirmed;
                pool.availableTokens += unusedTokens; // Add unused tokens back to available pool

                // Mark as completed
                reservation.returned = unusedTokens;
                reservation.completed = true;
                reservation.completedAt = Date.now();

                // Add to usage history for sliding window calculation
                this.addToUsageHistory(groupId, {
                    taskId,
                    groupId,
                    requested: reservation.requested,
                    confirmed: reservation.confirmed,
                    used: finalUsedTokens,
                    returned: unusedTokens,
                    remainingTokensFromHeaders,
                    timestamp: Date.now(),
                });

                log(`Completed token usage for task ${taskId} in group ${groupId}. Used: ${finalUsedTokens}, Returned: ${unusedTokens}, Remaining from Headers: ${remainingTokensFromHeaders}`);

                // Remove reservation
                pool.reservations.delete(taskId);
            } catch (error) {
                error(`Error completing token usage for task ${taskId} in group ${groupId}:`, error);
                // Don't rethrow - we still want to return the status
            }

            return {
                status: "completed",
                taskId,
                groupId,
                finalUsedTokens,
                returnedTokens: unusedTokens,
                availableTokens: pool.availableTokens,
                reservedTokens: pool.reservedTokens,
                timestamp: new Date().toISOString(),
            };
        } else {
            // Just confirm usage, don't complete
            log(`Confirmed ${finalUsedTokens} tokens used for task ${taskId} in group ${groupId}`);

            return {
                status: "confirmed",
                taskId,
                groupId,
                usedTokens: finalUsedTokens,
                remainingReserved: reservation.confirmed - finalUsedTokens,
                timestamp: new Date().toISOString(),
            };
        }
    }

    /**
     * Get status for a specific group
     * @param {number} groupId - The group ID to get status for
     * @param {boolean} [includeHistory=false] - Whether to include usage history
     * @returns {Object} Group status with token information and reservations
     */
    getGroupStatus(groupId, includeHistory = false) {
        this.ensureGroupExists(groupId);

        const pool = this.tokenPools.get(groupId);
        const config = this.groupConfigs.get(groupId);
        const now = Date.now();

        // Calculate sliding window status
        const windowStart = now - config.windowSize;
        const tokensUsedInWindow = this.getTokensUsedInWindow(groupId, now);
        const maxTokensInWindow = Math.floor(config.windowSize / 1000 * config.refillRate);

        const status = {
            groupId,
            availableTokens: pool.availableTokens,
            reservedTokens: pool.reservedTokens,
            maxTokens: config.maxTokens,
            windowSize: config.windowSize,
            windowStart: windowStart,
            windowEnd: now,
            tokensUsedInWindow,
            maxTokensInWindow,
            timeUntilRefill: this.getTimeUntilNextRefill(groupId),
            activeReservations: Array.from(pool.reservations.entries()).map(([taskId, reservation]) => ({
                taskId,
                requested: reservation.requested,
                confirmed: reservation.confirmed,
                used: reservation.used,
                timestamp: reservation.timestamp,
            })),
            timestamp: new Date().toISOString(),
        };

        if (includeHistory) {
            status.usageHistory = pool.usageHistory.slice(-20); // Last 20 entries
        }

        return status;
    }

    /**
     * Get status for all groups
     * @param {boolean} [includeHistory=false] - Whether to include usage history
     * @returns {Object} Status for all groups with total count
     */
    getAllGroupsStatus(includeHistory = false) {
        const allStatus = {};
        for (const groupId of this.tokenPools.keys()) {
            allStatus[groupId] = this.getGroupStatus(groupId, includeHistory);
        }

        return {
            groups: allStatus,
            totalGroups: this.tokenPools.size,
            timestamp: new Date().toISOString(),
        };
    }

    /**
     * Refill tokens based on sliding window
     * This implements a true sliding window rate limiter
     * @param {number} groupId - The group ID to refill tokens for
     */
    refillTokens(groupId) {
        const pool = this.tokenPools.get(groupId);
        const config = this.groupConfigs.get(groupId);
        const currentTime = Date.now();

        // Clean up old usage entries outside the sliding window
        this.cleanupOldUsageEntries(groupId, currentTime);

        // Calculate tokens available based on sliding window
        const tokensUsedInWindow = this.getTokensUsedInWindow(groupId, currentTime);
        const maxTokensInWindow = config.maxTokens;

        // Available tokens = max tokens in window - tokens used in window
        pool.availableTokens = maxTokensInWindow - tokensUsedInWindow;

        // Update window start to maintain sliding window
        pool.windowStart = currentTime - config.windowSize;
        pool.lastRefill = currentTime;

        if (pool.availableTokens > 0) {
            debug(`Sliding window refill for group ${groupId}: ${pool.availableTokens} tokens available (used: ${tokensUsedInWindow}, max: ${maxTokensInWindow})`);
        }
    }

    /**
     * Clean up old usage entries outside the sliding window
     * @param {number} groupId - The group ID to clean up
     * @param {number} now - Current timestamp
     */
    cleanupOldUsageEntries(groupId, now) {
        const pool = this.tokenPools.get(groupId);
        const config = this.groupConfigs.get(groupId);
        const windowStart = now - config.windowSize;

        // Remove usage entries older than the sliding window
        pool.usageHistory = pool.usageHistory.filter(entry => entry.timestamp >= windowStart);
    }

    /**
     * Get tokens used within the sliding window
     * @param {number} groupId - The group ID to check
     * @param {number} now - Current timestamp
     * @returns {number} Number of tokens used in the sliding window
     */
    getTokensUsedInWindow(groupId, now) {
        const pool = this.tokenPools.get(groupId);
        const config = this.groupConfigs.get(groupId);
        const windowStart = now - config.windowSize;

        // Sum tokens used within the sliding window
        const tokensUsed = pool.usageHistory
            .filter(entry => entry.timestamp >= windowStart)
            .reduce((sum, entry) => sum + entry.used, 0);

        debug(`Tokens used in window for group ${groupId}: ${tokensUsed} (window start: ${new Date(windowStart).toISOString()}, now: ${new Date(now).toISOString()})`);
        debug(`Usage history entries: ${pool.usageHistory.length}, filtered: ${pool.usageHistory.filter(entry => entry.timestamp >= windowStart).length}`);

        return tokensUsed;
    }

    /**
     * Reset the sliding window for a group
     * @param {number} groupId - The group ID to reset
     */
    resetWindow(groupId) {
        const pool = this.tokenPools.get(groupId);
        const config = this.groupConfigs.get(groupId);

        // Reset to full tokens
        pool.availableTokens = config.maxTokens;
        pool.reservedTokens = 0;
        pool.windowStart = Date.now();
        pool.lastRefill = Date.now();

        // Clear old reservations
        pool.reservations.clear();

        log(`Reset sliding window for group ${groupId}`);
    }

    /**
     * Get time until next refill (for sliding window)
     * @param {number} groupId - The group ID to check
     * @returns {number} Time in milliseconds until next refill
     */
    getTimeUntilNextRefill(groupId) {
        const pool = this.tokenPools.get(groupId);
        const config = this.groupConfigs.get(groupId);
        const now = Date.now();

        // For sliding window, calculate when the oldest usage entry will expire
        const windowStart = now - config.windowSize;
        const oldestUsageEntry = pool.usageHistory
            .filter(entry => entry.timestamp >= windowStart)
            .sort((a, b) => a.timestamp - b.timestamp)[0];

        if (!oldestUsageEntry) {
            return 0; // No usage in window, tokens are immediately available
        }

        // Calculate when the oldest entry will expire from the window
        const timeUntilOldestExpires = (oldestUsageEntry.timestamp + config.windowSize) - now;

        return Math.max(0, timeUntilOldestExpires);
    }

    /**
     * Add usage to history
     * @param {number} groupId - The group ID to add history to
     * @param {Object} entry - Usage entry to add
     */
    addToUsageHistory(groupId, entry) {
        const pool = this.tokenPools.get(groupId);
        pool.usageHistory.push(entry);

        debug(`Added to usage history for group ${groupId}:`, entry);

        // Keep only last 100 entries
        if (pool.usageHistory.length > 100) {
            pool.usageHistory = pool.usageHistory.slice(-100);
        }
    }

    /**
     * Perform cleanup of old data
     * Removes reservations older than 2x window size
     * @returns {Object} Cleanup result with count and message
     */
    performCleanup() {
        const currentTime = Date.now();

        // Only cleanup every 5 minutes
        if (currentTime - this.lastCleanup < this.cleanupInterval) {
            return { cleaned: 0, message: "Cleanup skipped - too soon since last cleanup" };
        }

        this.lastCleanup = currentTime;
        let totalCleaned = 0;

        // Cleanup old reservations
        for (const [groupId, pool] of this.tokenPools.entries()) {
            debug(`Performing cleanup for group ${groupId} (type: ${typeof groupId})`);
            const config = this.groupConfigs.get(groupId);
            if (!config) {
                debug(`Group configuration not found for group ${groupId}, skipping cleanup`);
                continue;
            }

            // Cleanup old reservations - use 2x window size as originally planned
            const maxAge = config.windowSize * 2; // 2x window size
            const reservationsBefore = pool.reservations.size;

            for (const [taskId, reservation] of pool.reservations.entries()) {
                const age = currentTime - reservation.timestamp;
                if (age > maxAge && !reservation.completed) {
                    // Return tokens to pool
                    pool.availableTokens += reservation.confirmed;
                    pool.reservedTokens -= reservation.confirmed;
                    pool.reservations.delete(taskId);
                    totalCleaned++;

                    log(`Cleaned up old reservation for task ${taskId} in group ${groupId} (age: ${Math.round(age / 1000)}s)`);
                }
            }

            const reservationsAfter = pool.reservations.size;
            debug(`Group ${groupId}: cleaned ${reservationsBefore - reservationsAfter} reservations`);
        }

        return {
            cleaned: totalCleaned,
            message: `Cleaned up ${totalCleaned} old reservations`,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Ensure group exists
     * @param {number} groupId - The group ID to check
     * @throws {Error} If group doesn't exist
     */
    ensureGroupExists(groupId) {
        if (!this.tokenPools.has(groupId)) {
            throw new Error(`Token group '${groupId}' not configured`);
        }
        if (!this.groupConfigs.has(groupId)) {
            throw new Error(`Group configuration for '${groupId}' not found`);
        }
    }

    /**
     * Get statistics for a group
     * @param {number} groupId - The group ID to get statistics for
     * @returns {Object} Group statistics including usage and efficiency
     */
    getGroupStatistics(groupId) {
        this.ensureGroupExists(groupId);

        const pool = this.tokenPools.get(groupId);
        const config = this.groupConfigs.get(groupId);

        const totalUsed = pool.usageHistory.reduce((sum, entry) => sum + entry.used, 0);
        const totalReturned = pool.usageHistory.reduce((sum, entry) => sum + entry.returned, 0);
        const averageUsage = pool.usageHistory.length > 0 ? totalUsed / pool.usageHistory.length : 0;

        return {
            groupId,
            totalProcessedTasks: pool.usageHistory.length,
            totalTokensUsed: totalUsed,
            totalTokensReturned: totalReturned,
            averageUsagePerTask: averageUsage,
            efficiency: pool.usageHistory.length > 0 ? (totalUsed / (totalUsed + totalReturned)) * 100 : 0,
            currentPoolStatus: this.getGroupStatus(groupId),
        };
    }

    /**
     * Reset a specific group
     * @param {number} groupId - The group ID to reset
     */
    resetGroup(groupId) {
        this.ensureGroupExists(groupId);

        const pool = this.tokenPools.get(groupId);
        const config = this.groupConfigs.get(groupId);

        pool.availableTokens = config.maxTokens;
        pool.reservedTokens = 0;
        pool.reservations.clear();
        pool.usageHistory = [];
        pool.windowStart = Date.now();
        pool.lastRefill = Date.now();

        log(`Reset group ${groupId}`);
    }

    /**
     * Reset all groups
     * Resets all token pools to their initial state
     */
    resetAllGroups() {
        for (const groupId of this.tokenPools.keys()) {
            this.resetGroup(groupId);
        }

        log("Reset all token groups");
    }

    /**
     * Write token pools to database for a specific group
     * @param {number} groupId - The group ID to write
     * @async
     */
    async writeTokenPoolsToDatabase(groupId) {
        try {
            const db = getDatabase();
            const path = db.ref(`live-data/esi-token-pools`);
            const pool = this.tokenPools.get(groupId);
            const tokenObject = tokenPoolToObject(pool);
            await path.set(tokenObject);
        } catch (err) {
            error("Error writing token pools to database:", err);
        }
    }

    /**
     * Write all token pools to database
     * @async
     */
    async writeTokenPoolsToDatabase() {
        try {
            const db = getDatabase();
            const path = db.ref(`live-data/esi-token-pools`);

            const tokenObject = {};

            this.tokenPools.forEach((pool, groupId) => {
                // Store group ID as number in database
                tokenObject[groupId] = tokenPoolToObject(pool);
            });

            await path.set(tokenObject);
            debug('Token pools written to database successfully');
        } catch (err) {
            error("Error writing token usage to database:", err);
        }
    }

    /**
     * Read token pools from database
     * @returns {Promise<Object>} Token pools data from database
     * @async
     */
    async readTokenPoolsFromDatabase() {
        const db = getDatabase();
        const path = db.ref(`live-data/esi-token-pools`);

        const snapshot = await path.once('value');
        const data = snapshot.val();
        return data || {}; // Return empty object if no data exists
    }

    /**
     * Restore token pools from database
     * Loads and validates token pool data from database
     * @async
     */
    async restoreTokenPoolsFromDatabase() {
        const tokenObject = await this.readTokenPoolsFromDatabase();

        // Only restore if there's actual data
        if (tokenObject && Object.keys(tokenObject).length > 0) {
            Object.keys(tokenObject).forEach(groupId => {
                const pool = objectToTokenPool(tokenObject[groupId]);

                // Validate the restored pool data
                if (isNaN(pool.availableTokens) || isNaN(pool.reservedTokens)) {
                    debug(`Invalid token pool data for group ${groupId}, resetting to defaults`);
                    const groupConfig = this.groupConfigs.get(Number(groupId));
                    if (groupConfig) {
                        pool.availableTokens = groupConfig.maxTokens;
                        pool.reservedTokens = 0;
                    }
                }

                // Use the group ID as-is (should be consistent now)
                this.tokenPools.set(Number(groupId), pool);
                debug(`Restored token pool for group ${groupId}`);
            });
        }
    }
}

/**
 * Convert token pool to database object
 * @param {Object} pool - Token pool to convert
 * @returns {Object} Database-ready token pool object
 */
function tokenPoolToObject(pool) {
    return {
        availableTokens: Number(pool.availableTokens) || 0,
        reservedTokens: Number(pool.reservedTokens) || 0,
        reservations: Array.from(pool.reservations.entries()),
        usageHistory: pool.usageHistory ? pool.usageHistory.filter(item => item !== undefined && item !== null) : [],
        windowStart: Number(pool.windowStart) || Date.now(),
        lastRefill: Number(pool.lastRefill) || Date.now(),
    };
}

/**
 * Convert database object to token pool
 * @param {Object} object - Database object to convert
 * @returns {Object} Token pool object
 */
function objectToTokenPool(object) {
    return {
        availableTokens: Number(object.availableTokens) || 0,
        reservedTokens: Number(object.reservedTokens) || 0,
        reservations: new Map((object.reservations || []).map(([taskId, reservation]) => [taskId, reservation])),
        usageHistory: object.usageHistory || [],
        windowStart: Number(object.windowStart) || Date.now(),
        lastRefill: Number(object.lastRefill) || Date.now(),
    };
}

export default ESITokenManager;
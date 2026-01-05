/**
 * React Hook for ESI Rate Limiting
 * Provides easy integration with ESI rate limiting system in React components
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { getESIRateLimitStatuses, getESIQueueStatuses, clearESILimits } from '../Functions/EveESI/fetchWithCustomHeaders.js';

/**
 * Hook for monitoring ESI rate limiting status
 * @param {Object} options - Configuration options
 * @returns {Object} Rate limiting status and controls
 */
function useESIRateLimiting(options = {}) {
  const {
    updateInterval = 5000, // Update every 5 seconds
    autoClear = false, // Auto-clear limits after a certain time
    clearAfter = 300000, // 5 minutes
  } = options;

  const [rateLimitStatuses, setRateLimitStatuses] = useState([]);
  const [queueStatuses, setQueueStatuses] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const intervalRef = useRef(null);
  const clearTimeoutRef = useRef(null);

  // Update rate limit statuses
  const updateStatuses = useCallback(() => {
    try {
      const rateLimits = getESIRateLimitStatuses();
      const queues = getESIQueueStatuses();
      
      setRateLimitStatuses(rateLimits);
      setQueueStatuses(queues);
      setError(null);
    } catch (err) {
      setError(err.message);
      console.error('Error updating ESI rate limit statuses:', err);
    }
  }, []);

  // Clear all rate limits
  const clearLimits = useCallback(() => {
    try {
      clearESILimits();
      updateStatuses();
    } catch (err) {
      setError(err.message);
      console.error('Error clearing ESI rate limits:', err);
    }
  }, [updateStatuses]);

  // Get status for a specific group
  const getGroupStatus = useCallback((group) => {
    return rateLimitStatuses.find(status => status.group === group);
  }, [rateLimitStatuses]);

  // Get queue status for a specific group
  const getQueueStatus = useCallback((group) => {
    return queueStatuses[group];
  }, [queueStatuses]);

  // Check if a group is rate limited
  const isRateLimited = useCallback((group) => {
    const status = getGroupStatus(group);
    return status ? status.availableTokens <= 0 : false;
  }, [getGroupStatus]);

  // Get estimated wait time for a group
  const getWaitTime = useCallback((group) => {
    const status = getGroupStatus(group);
    if (!status) return 0;
    
    // Calculate when enough tokens will be available
    const now = Date.now();
    const timeSinceLastUpdate = now - status.lastUpdated;
    const tokensPerMs = status.maxTokens / status.windowSize;
    const tokensToRecover = status.maxTokens - status.availableTokens;
    
    if (tokensToRecover <= 0) return 0;
    
    return Math.ceil(tokensToRecover / tokensPerMs);
  }, [getGroupStatus]);

  // Start monitoring
  const startMonitoring = useCallback(() => {
    if (intervalRef.current) return;
    
    setIsLoading(true);
    updateStatuses();
    
    intervalRef.current = setInterval(updateStatuses, updateInterval);
    setIsLoading(false);
  }, [updateStatuses, updateInterval]);

  // Stop monitoring
  const stopMonitoring = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Auto-clear limits if enabled
  useEffect(() => {
    if (autoClear && rateLimitStatuses.length > 0) {
      clearTimeoutRef.current = setTimeout(() => {
        clearLimits();
      }, clearAfter);
    }
    
    return () => {
      if (clearTimeoutRef.current) {
        clearTimeout(clearTimeoutRef.current);
      }
    };
  }, [autoClear, clearAfter, clearLimits, rateLimitStatuses.length]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopMonitoring();
      if (clearTimeoutRef.current) {
        clearTimeout(clearTimeoutRef.current);
      }
    };
  }, [stopMonitoring]);

  // Get character's token count for a specific group
  const getCharacterTokenCount = useCallback((group, characterHash) => {
    const status = getGroupStatus(group);
    if (!status) return null;
    
    // For character-specific rate limiting, we need to check if this character
    // has its own bucket or if it's using a shared bucket
    const characterBucket = rateLimitStatuses.find(s => 
      s.group === group && s.userID === characterHash
    );
    
    if (characterBucket) {
      return {
        availableTokens: characterBucket.availableTokens,
        maxTokens: characterBucket.maxTokens,
        percentage: (characterBucket.availableTokens / characterBucket.maxTokens) * 100,
        isRateLimited: characterBucket.availableTokens <= 0,
        waitTime: getWaitTime(group)
      };
    }
    
    // Fallback to group status if no character-specific bucket
    return {
      availableTokens: status.availableTokens,
      maxTokens: status.maxTokens,
      percentage: (status.availableTokens / status.maxTokens) * 100,
      isRateLimited: status.availableTokens <= 0,
      waitTime: getWaitTime(group)
    };
  }, [rateLimitStatuses, getGroupStatus, getWaitTime]);

  // Get all character token counts
  const getAllCharacterTokenCounts = useCallback((characterHash) => {
    const characterGroups = ['character', 'market', 'corporation', 'universe'];
    
    return characterGroups.reduce((acc, group) => {
      const tokenCount = getCharacterTokenCount(group, characterHash);
      if (tokenCount) {
        acc[group] = tokenCount;
      }
      return acc;
    }, {});
  }, [getCharacterTokenCount]);

  // Get overall statistics
  const getStatistics = useCallback(() => {
    const totalPending = Object.values(queueStatuses).reduce(
      (sum, status) => sum + (status.pending || 0), 0
    );
    
    const totalProcessing = Object.values(queueStatuses).reduce(
      (sum, status) => sum + (status.processing ? 1 : 0), 0
    );
    
    const rateLimitedGroups = rateLimitStatuses.filter(
      status => status.availableTokens <= 0
    ).length;
    
    return {
      totalPending,
      totalProcessing,
      rateLimitedGroups,
      totalGroups: rateLimitStatuses.length,
      queueStatuses,
      rateLimitStatuses
    };
  }, [queueStatuses, rateLimitStatuses]);

  return {
    // Status data
    rateLimitStatuses,
    queueStatuses,
    isLoading,
    error,
    
    // Controls
    updateStatuses,
    clearLimits,
    startMonitoring,
    stopMonitoring,
    
    // Utilities
    getGroupStatus,
    getQueueStatus,
    isRateLimited,
    getWaitTime,
    getStatistics,
    
    // Character-specific functions
    getCharacterTokenCount,
    getAllCharacterTokenCounts
  };
}

export default useESIRateLimiting;

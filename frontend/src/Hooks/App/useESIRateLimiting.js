import { useState, useEffect, useCallback, useRef } from "react";
import {
  getESIRateLimitStatuses,
  getESIQueueStatuses,
  clearESILimits,
} from "../../Functions/EveESI/fetchWithCustomHeaders.js";

function useESIRateLimiting(options = {}) {
  const {
    updateInterval = 5000,
    autoClear = false,
    clearAfter = 300000,
  } = options;

  const [rateLimitStatuses, setRateLimitStatuses] = useState([]);
  const [queueStatuses, setQueueStatuses] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const intervalRef = useRef(null);
  const clearTimeoutRef = useRef(null);

  const updateStatuses = useCallback(() => {
    try {
      const rateLimits = getESIRateLimitStatuses();
      const queues = getESIQueueStatuses();
      setRateLimitStatuses(rateLimits);
      setQueueStatuses(queues);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  const clearLimits = useCallback(() => {
    try {
      clearESILimits();
      updateStatuses();
    } catch (err) {
      setError(err.message);
    }
  }, [updateStatuses]);

  const getGroupStatus = useCallback(
    (group) => rateLimitStatuses.find((status) => status.group === group),
    [rateLimitStatuses]
  );

  const getQueueStatus = useCallback((group) => queueStatuses[group], [queueStatuses]);

  const isRateLimited = useCallback((group) => {
    const status = getGroupStatus(group);
    return status ? status.availableTokens <= 0 : false;
  }, [getGroupStatus]);

  const getWaitTime = useCallback((group) => {
    const status = getGroupStatus(group);
    if (!status) return 0;
    const tokensPerMs = status.maxTokens / status.windowSize;
    const tokensToRecover = status.maxTokens - status.availableTokens;
    if (tokensToRecover <= 0) return 0;
    return Math.ceil(tokensToRecover / tokensPerMs);
  }, [getGroupStatus]);

  const startMonitoring = useCallback(() => {
    if (intervalRef.current) return;
    setIsLoading(true);
    updateStatuses();
    intervalRef.current = setInterval(updateStatuses, updateInterval);
    setIsLoading(false);
  }, [updateStatuses, updateInterval]);

  const stopMonitoring = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (autoClear && rateLimitStatuses.length > 0) {
      clearTimeoutRef.current = setTimeout(() => {
        clearLimits();
      }, clearAfter);
    }
    return () => {
      if (clearTimeoutRef.current) clearTimeout(clearTimeoutRef.current);
    };
  }, [autoClear, clearAfter, clearLimits, rateLimitStatuses.length]);

  useEffect(() => {
    return () => {
      stopMonitoring();
      if (clearTimeoutRef.current) clearTimeout(clearTimeoutRef.current);
    };
  }, [stopMonitoring]);

  const getCharacterTokenCount = useCallback((group, characterHash) => {
    const status = getGroupStatus(group);
    if (!status) return null;
    const characterBucket = rateLimitStatuses.find(
      (s) => s.group === group && s.userID === characterHash
    );
    if (characterBucket) {
      return {
        availableTokens: characterBucket.availableTokens,
        maxTokens: characterBucket.maxTokens,
        percentage: (characterBucket.availableTokens / characterBucket.maxTokens) * 100,
        isRateLimited: characterBucket.availableTokens <= 0,
        waitTime: getWaitTime(group),
      };
    }
    return {
      availableTokens: status.availableTokens,
      maxTokens: status.maxTokens,
      percentage: (status.availableTokens / status.maxTokens) * 100,
      isRateLimited: status.availableTokens <= 0,
      waitTime: getWaitTime(group),
    };
  }, [rateLimitStatuses, getGroupStatus, getWaitTime]);

  const getAllCharacterTokenCounts = useCallback((characterHash) => {
    const characterGroups = ["character", "market", "corporation", "universe"];
    return characterGroups.reduce((acc, group) => {
      const tokenCount = getCharacterTokenCount(group, characterHash);
      if (tokenCount) acc[group] = tokenCount;
      return acc;
    }, {});
  }, [getCharacterTokenCount]);

  const getStatistics = useCallback(() => {
    const totalPending = Object.values(queueStatuses).reduce(
      (sum, status) => sum + (status.pending || 0),
      0
    );
    const totalProcessing = Object.values(queueStatuses).reduce(
      (sum, status) => sum + (status.processing ? 1 : 0),
      0
    );
    const rateLimitedGroups = rateLimitStatuses.filter(
      (status) => status.availableTokens <= 0
    ).length;
    return {
      totalPending,
      totalProcessing,
      rateLimitedGroups,
      totalGroups: rateLimitStatuses.length,
      queueStatuses,
      rateLimitStatuses,
    };
  }, [queueStatuses, rateLimitStatuses]);

  return {
    rateLimitStatuses,
    queueStatuses,
    isLoading,
    error,
    updateStatuses,
    clearLimits,
    startMonitoring,
    stopMonitoring,
    getGroupStatus,
    getQueueStatus,
    isRateLimited,
    getWaitTime,
    getStatistics,
    getCharacterTokenCount,
    getAllCharacterTokenCounts,
  };
}

export default useESIRateLimiting;

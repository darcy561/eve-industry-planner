import { useQueries } from "@tanstack/react-query";
import { useMemo, useCallback } from "react";
import useUsersStore from "../../Zustand/usersStore";
import { characterIndustryJobsQuery, characterIndustryJobsQueryKey } from "../React Query/Character/industryJobs";
import { corporationIndustryJobsQuery, corporationIndustryJobsQueryKey } from "../React Query/Corporation/industryJobs";
import {
  isQueryObserverResultLoading,
  isQueryStateLoading,
} from "./queryLoadingState";

/**
 * Utility function to deduplicate industry jobs by job_id.
 * Removes duplicate jobs based on their unique job_id property.
 * 
 * @param {Array<Object>} jobs - Array of industry job objects
 * @returns {Array<Object>} Array of unique industry job objects
 * 
 * @private
 */
function deduplicateJobs(jobs) {
  const uniqueJobs = new Map();
  jobs.forEach((job) => {
    if (!uniqueJobs.has(job.job_id)) {
      uniqueJobs.set(job.job_id, job);
    }
  });
  return Array.from(uniqueJobs.values());
}

/**
 * Utility function to extract and flatten corporation industry jobs from query results.
 * Handles different corporation job data structures and extracts job arrays.
 * 
 * @param {Array<Object>} results - Array of query result objects
 * @returns {Array<Object>} Flattened array of corporation industry jobs
 * 
 * @private
 */
function extractCorporationJobs(results) {
  return results.flatMap((result) => {
    if (!result.data) return [];
    
    // Handle the corporation jobs structure: { corporation_id: X, data: [...] }
    if (result.data.corporation_id && Array.isArray(result.data.data)) {
      return result.data.data;
    }
    
    // If it's just a direct array of jobs
    if (Array.isArray(result.data)) {
      return result.data;
    }
    
    return [];
  });
}

/**
 * Utility function to extract character industry jobs from query results.
 * Extracts job data from character query results.
 * 
 * @param {Array<Object>} results - Array of query result objects
 * @returns {Array<Object>} Flattened array of character industry jobs
 * 
 * @private
 */
function extractCharacterJobs(results) {
  return results.flatMap((result) => result.data?.data || []);
}

/**
 * Utility function to create error object for industry jobs queries.
 * 
 * @param {Error} error - Error object
 * @returns {Object} Error state object
 * 
 * @private
 */
function createErrorObject(error) {
  return {
    data: [],
    isLoading: false,
    isError: error !== null,
    error,
  };
}

/**
 * Utility function to create loading object for industry jobs queries.
 * 
 * @returns {Object} Loading state object
 * 
 * @private
 */
function createLoadingObject() {
  return {
    data: [],
    isLoading: true,
    isError: false,
    error: null,
  };
}

/**
 * Utility function to create success object for industry jobs queries.
 * 
 * @param {Array<Object>} data - Array of industry job objects
 * @returns {Object} Success state object
 * 
 * @private
 */
function createSuccessObject(data) {
  return {
    data,
    isLoading: false,
    isError: false,
    error: null,
  };
}

/**
 * Retrieves cached industry jobs data from React Query cache for all users.
 * 
 * This function provides access to cached industry jobs data without triggering new queries:
 * - Checks loading states for all character and corporation industry job queries
 * - Extracts cached data from React Query cache
 * - Combines character and corporation jobs with deduplication
 * - Handles different data structures for character vs corporation jobs
 * - Returns appropriate loading, error, or success states
 * 
 * The caching process:
 * 1. Gets all user character hashes from the store
 * 2. Checks query states for character and corporation industry jobs
 * 3. Determines overall loading and error states
 * 4. Extracts cached data from successful queries
 * 5. Combines and deduplicates all industry jobs
 * 
 * @param {Object} queryClient - React Query client instance
 * @returns {Object} Object containing cached industry jobs data
 * @returns {Array<Object>} returns.data - Array of unique industry jobs
 * @returns {boolean} returns.isLoading - Whether any queries are still loading
 * @returns {boolean} returns.isError - Whether any queries have errors
 * @returns {Error|null} returns.error - First error encountered, if any
 * 
 * @example
 * const cachedJobs = getCachedAllIndustryJobs(queryClient);
 * if (!cachedJobs.isLoading && !cachedJobs.isError) {
 *   console.log(`Found ${cachedJobs.data.length} industry jobs`);
 * }
 */
export function getCachedAllIndustryJobs(queryClient) {
  const { userArray } = useUsersStore.getState().users;

  // Get query states for all characters and corporations
  const queryStates = userArray.flatMap(({ CharacterHash }) => [
    // Character industry jobs query state
    {
      queryState: queryClient.getQueryState([characterIndustryJobsQueryKey, CharacterHash]),
      cachedData: queryClient.getQueryData([characterIndustryJobsQueryKey, CharacterHash]),
      type: 'character'
    },
    // Corporation industry jobs query state
    {
      queryState: queryClient.getQueryState([corporationIndustryJobsQueryKey, CharacterHash]),
      cachedData: queryClient.getQueryData([corporationIndustryJobsQueryKey, CharacterHash]),
      type: 'corporation'
    }
  ]);

  // Check loading state
  const isLoading = queryStates.some(({ queryState }) =>
    isQueryStateLoading(queryState)
  );

  if (isLoading) {
    return createLoadingObject();
  }

  // Check for errors
  const error = queryStates.find(({ queryState }) => queryState?.error)?.queryState?.error;

  if (error) {
    return createErrorObject(error);
  }

  // Extract cached industry jobs
  const characterJobs = queryStates
    .filter(({ type }) => type === 'character')
    .map(({ cachedData }) => cachedData?.data || [])
    .flat();

  const corporationJobs = queryStates
    .filter(({ type }) => type === 'corporation')
    .map(({ cachedData }) => {
      if (!cachedData) return [];
      
      // Handle the corporation jobs structure: { corporation_id: X, data: [...] }
      if (cachedData.corporation_id && Array.isArray(cachedData.data)) {
        return cachedData.data;
      }
      
      // If it's just a direct array of jobs
      if (Array.isArray(cachedData)) {
        return cachedData;
      }
      
      return [];
    })
    .flat();

  // Combine and deduplicate
  const allJobs = [...characterJobs, ...corporationJobs];
  const deduplicatedJobs = deduplicateJobs(allJobs);

  return createSuccessObject(deduplicatedJobs);
}

/**
 * Custom hook that fetches industry jobs for all characters and corporations.
 * 
 * This hook provides comprehensive industry job data fetching:
 * - Fetches industry jobs for all user characters
 * - Fetches industry jobs for all user corporations
 * - Combines character and corporation jobs with deduplication
 * - Handles different data structures for character vs corporation jobs
 * - Provides loading, error, and success states
 * - Uses React Query's useQueries for parallel data fetching
 * 
 * The fetching process:
 * 1. Creates queries for all character industry jobs
 * 2. Creates queries for all corporation industry jobs
 * 3. Combines results using a custom combine function
 * 4. Deduplicates jobs based on job_id
 * 5. Returns unified data structure with loading states
 * 
 * @returns {Object} Object containing industry jobs data and states
 * @returns {Array<Object>} returns.data - Array of unique industry jobs from all sources
 * @returns {boolean} returns.isLoading - Whether any queries are still loading
 * @returns {Error|null} returns.error - First error encountered, if any
 * 
 * @example
 * function IndustryJobsManager() {
 *   const { data: industryJobs, isLoading, error } = useGetAllIndustryJobs();
 * 
 *   if (isLoading) return <div>Loading industry jobs...</div>;
 *   if (error) return <div>Error: {error.message}</div>;
 *   return <div>Industry Jobs: {industryJobs.length} active jobs</div>;
 * }
 */
export default function useGetAllIndustryJobs() {
  const { userArray } = useUsersStore((state) => state.users);

  const combineFunction = useCallback((results) => {
    const isLoading = results.some(isQueryObserverResultLoading);
    const error = results.find((result) => result.error)?.error;

    if (isLoading) {
      return {
        data: [],
        isLoading: true,
        error: null,
      };
    }

    if (error) {
      return {
        data: [],
        isLoading: false,
        error,
      };
    }

    // Split results into character and corporation queries
    const characterResults = results.slice(0, userArray.length);
    const corporationResults = results.slice(userArray.length);

    // Extract jobs from both sources
    const characterJobs = extractCharacterJobs(characterResults);
    const corporationJobs = extractCorporationJobs(corporationResults);

    // Combine and deduplicate
    const allJobs = [...characterJobs, ...corporationJobs];

    const deduplicatedJobs = deduplicateJobs(allJobs);

    return {
      data: deduplicatedJobs,
      isLoading: false,
      error: null,
    };
  }, [userArray]);

  // Create queries for both character and corporation industry jobs
  const queries = [
    // Character industry jobs queries
    ...userArray.map(({ CharacterHash }) => characterIndustryJobsQuery(CharacterHash)),
    // Corporation industry jobs queries
    ...userArray.map(({ CharacterHash }) => corporationIndustryJobsQuery(CharacterHash)),
  ];

  const result = useQueries({
    queries,
    combine: combineFunction,
  });

  return result;
} 
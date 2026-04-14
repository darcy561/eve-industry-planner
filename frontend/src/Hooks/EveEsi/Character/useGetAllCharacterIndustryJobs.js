import { useQueries, useQuery } from "@tanstack/react-query";
import useUsersStore from "../../../Zustand/usersStore";
import { useMemo, useCallback } from "react";
import { characterIndustryJobsQuery, characterIndustryJobsQueryKey } from "../../React Query/Character/industryJobs";
import {
  isQueryObserverResultLoading,
  isQueryStateLoading,
} from "../queryLoadingState";

/**
 * Utility function to extract industry jobs from query results.
 * Handles the data structure returned by character industry jobs queries.
 * 
 * @param {Array<Object>} results - Array of query result objects
 * @returns {Array<Object>} Flattened array of industry job objects
 * 
 * @private
 */
function extractIndustryJobsFromResults(results) {
  return results.flatMap((result) => result.data?.data || []);
}

/**
 * Utility function to check loading state from query results.
 * 
 * @param {Array<Object>} results - Array of query result objects
 * @returns {boolean} True if any query is loading
 * 
 * @private
 */
function checkLoadingState(results) {
  return results.some(isQueryObserverResultLoading);
}

/**
 * Utility function to find first error from query results.
 * 
 * @param {Array<Object>} results - Array of query result objects
 * @returns {Error|null} First error found, or null if none
 * 
 * @private
 */
function findFirstError(results) {
  return results.find((result) => result.error)?.error;
}

/**
 * Utility function to create error object for character industry jobs queries.
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
 * Utility function to create loading object for character industry jobs queries.
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
 * Utility function to create success object for character industry jobs queries.
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
 * Retrieves cached character industry jobs data from React Query cache for all users.
 * 
 * This function provides access to cached character industry jobs data without triggering new queries:
 * - Fetches industry jobs for all user characters
 * - Checks loading states for all character industry job queries
 * - Extracts cached data from React Query cache
 * - Combines and deduplicates all industry jobs
 * - Returns appropriate loading, error, or success states
 * 
 * The caching process:
 * 1. Gets all user character hashes from the store
 * 2. Checks query states for all character industry job queries
 * 3. Determines overall loading and error states
 * 4. Extracts cached data from successful queries
 * 5. Combines and deduplicates all industry jobs
 * 
 * @param {Object} queryClient - React Query client instance
 * @returns {Object} Object containing cached character industry jobs data
 * @returns {Array<Object>} returns.data - Array of unique industry jobs from all characters
 * @returns {boolean} returns.isLoading - Whether any queries are still loading
 * @returns {boolean} returns.isError - Whether any queries have errors
 * @returns {Error|null} returns.error - First error encountered, if any
 * 
 * @example
 * const cachedJobs = getCachedCharacterIndustryJobs(queryClient);
 * if (!cachedJobs.isLoading && !cachedJobs.isError) {
 *   console.log(`Found ${cachedJobs.data.length} unique industry jobs`);
 * }
 */
export function getCachedCharacterIndustryJobs(queryClient) {
  const characters = useUsersStore.getState().account.characters;

  // Get query states for all characters
  const queryStates = characters.map(({ CharacterHash }) => {
    const queryKey = [characterIndustryJobsQueryKey, CharacterHash];
    return {
      queryState: queryClient.getQueryState(queryKey),
      cachedData: queryClient.getQueryData(queryKey),
    };
  });

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
  const cachedJobs = queryStates
    .map(({ cachedData }) => cachedData?.data || [])
    .flat();

  const deduplicatedJobs = deduplicateJobs(cachedJobs);

  return createSuccessObject(deduplicatedJobs);
}

/**
 * Custom hook that fetches character industry jobs for all user characters.
 * 
 * This hook provides comprehensive character industry jobs data fetching:
 * - Fetches industry jobs for all user characters in parallel
 * - Combines industry jobs from all characters into a single dataset
 * - Deduplicates jobs based on job_id to prevent duplicates
 * - Provides loading, error, and success states
 * - Uses React Query's useQueries for parallel data fetching
 * - Supports industry job management and analysis
 * 
 * The fetching process:
 * 1. Gets all user character hashes from the store
 * 2. Creates queries for all character industry job data
 * 3. Fetches data in parallel using React Query's useQueries
 * 4. Combines results using a custom combine function
 * 5. Deduplicates jobs based on job_id
 * 
 * @returns {Object} Object containing character industry jobs data and states
 * @returns {Array<Object>} returns.data - Array of unique industry jobs from all characters
 * @returns {boolean} returns.isLoading - Whether any queries are still loading
 * @returns {boolean} returns.isError - Whether any queries have errors
 * @returns {Error|null} returns.error - First error encountered, if any
 * 
 * @example
 * function CharacterIndustryJobsManager() {
 *   const { data: allJobs, isLoading, isError, error } = useGetAllCharacterIndustryJobs();
 * 
 *   if (isLoading) return <div>Loading industry jobs...</div>;
 *   if (isError) return <div>Error: {error.message}</div>;
 *   return <div>Industry Jobs: {allJobs.length} unique jobs across all characters</div>;
 * }
 */
function useGetAllCharacterIndustryJobs() {
  const characters = useUsersStore((state) => state.account.characters);

  const combineFunction = useCallback((results) => {
    const isLoading = checkLoadingState(results);
    const error = findFirstError(results);
    const allJobs = extractIndustryJobsFromResults(results);
    const deduplicatedJobs = deduplicateJobs(allJobs);

    if (isLoading) {
      return createLoadingObject();
    }

    if (error) {
      return createErrorObject(error);
    }

    return createSuccessObject(deduplicatedJobs);
  }, [characters]);

  const result = useQueries({
    queries: characters.map(({ CharacterHash }) => characterIndustryJobsQuery(CharacterHash)),
    combine: combineFunction,
  });

  return result;
}

export default useGetAllCharacterIndustryJobs;

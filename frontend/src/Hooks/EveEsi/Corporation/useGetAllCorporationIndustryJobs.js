import { useQueries } from "@tanstack/react-query";
import useUsersStore from "../../../Zustand/usersStore";
import { useCallback } from "react";
import { corporationIndustryJobsQuery, corporationIndustryJobsQueryKey } from "../../React Query/Corporation/industryJobs";
import {
  isQueryObserverResultLoading,
  isQueryStateLoading,
} from "../queryLoadingState";

/**
 * Utility function to extract industry jobs from query results.
 * Handles the data structure returned by corporation industry jobs queries.
 * 
 * @param {Array<Object>} results - Array of query result objects
 * @returns {Array<Object>} Flattened array of industry job objects
 * 
 * @private
 */
function extractIndustryJobsFromResults(results) {
  return results.flatMap((result) => {
    const pages = result.data?.pages?.[0]?.pages || [];
    return pages.flatMap((page) => page.data || []);
  });
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
 * Utility function to create error object for corporation industry jobs queries.
 * 
 * @param {Error} error - Error object
 * @returns {Object} Error state object
 * 
 * @private
 */
function createErrorObject(error) {
  return {
    data: {},
    isLoading: false,
    isError: error !== null,
    error,
  };
}

/**
 * Utility function to create loading object for corporation industry jobs queries.
 * 
 * @returns {Object} Loading state object
 * 
 * @private
 */
function createLoadingObject() {
  return {
    data: {},
    isLoading: true,
    isError: false,
    error: null,
  };
}

/**
 * Utility function to create success object for corporation industry jobs queries.
 * 
 * @param {Object} data - Object with corporation IDs as keys and industry job arrays as values
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
 * Utility function to group industry jobs by corporation.
 * 
 * @param {Array<Object>} jobs - Array of industry job objects
 * @returns {Object} Object with corporation IDs as keys and industry job arrays as values
 * 
 * @private
 */
function groupIndustryJobsByCorporation(jobs) {
  return jobs.reduce((acc, job) => {
    const corpId = job.corporation_id;
    if (!acc[corpId]) {
      acc[corpId] = [];
    }
    acc[corpId].push(job);
    return acc;
  }, {});
}

/**
 * Retrieves cached corporation industry jobs data from React Query cache for all users.
 * 
 * This function provides access to cached corporation industry jobs data without triggering new queries:
 * - Fetches industry jobs for all user corporations
 * - Checks loading states for all corporation industry job queries
 * - Extracts cached data from React Query cache
 * - Groups jobs by corporation ID for easy access
 * - Returns appropriate loading, error, or success states
 * 
 * The caching process:
 * 1. Gets all user character hashes from the store
 * 2. Checks query states for all corporation industry job queries
 * 3. Determines overall loading and error states
 * 4. Extracts cached data from successful queries
 * 5. Groups jobs by corporation ID
 * 
 * @param {Object} queryClient - React Query client instance
 * @returns {Object} Object containing cached corporation industry jobs data
 * @returns {Object} returns.data - Object with corporation IDs as keys and industry job arrays as values
 * @returns {boolean} returns.isLoading - Whether any queries are still loading
 * @returns {boolean} returns.isError - Whether any queries have errors
 * @returns {Error|null} returns.error - First error encountered, if any
 * 
 * @example
 * const cachedJobs = getCachedCorporationIndustryJobs(queryClient);
 * if (!cachedJobs.isLoading && !cachedJobs.isError) {
 *   Object.keys(cachedJobs.data).forEach(corpId => {
 *     console.log(`Corporation ${corpId}: ${cachedJobs.data[corpId].length} industry jobs`);
 *   });
 * }
 */
export function getCachedCorporationIndustryJobs(queryClient) {
  const userArray = useUsersStore.getState().users.userArray;

  // Get query states for all users
  const queryStates = userArray.map((user) => {
    const queryKey = [corporationIndustryJobsQueryKey, user.CharacterHash];
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
    .map(({ cachedData }) => {
      const pages = cachedData?.pages?.[0]?.pages || [];
      return pages.flatMap((page) => page.data || []);
    })
    .flat();

  const groupedJobs = groupIndustryJobsByCorporation(cachedJobs);

  return createSuccessObject(groupedJobs);
}

/**
 * Custom hook that fetches corporation industry jobs for all user corporations.
 * 
 * This hook provides comprehensive corporation industry jobs data fetching:
 * - Fetches industry jobs for all user corporations in parallel
 * - Groups jobs by corporation ID for easy access
 * - Handles pagination automatically through the underlying query
 * - Provides loading, error, and success states
 * - Uses React Query's useQueries for parallel data fetching
 * - Supports corporation industry job management and analysis
 * 
 * The fetching process:
 * 1. Gets all user character hashes from the store
 * 2. Creates queries for all corporation industry job data
 * 3. Fetches data in parallel using React Query's useQueries
 * 4. Combines results using a custom combine function
 * 5. Groups jobs by corporation ID for structured access
 * 
 * @returns {Object} Object containing corporation industry jobs data and states
 * @returns {Object} returns.data - Object with corporation IDs as keys and industry job arrays as values
 * @returns {boolean} returns.isLoading - Whether any queries are still loading
 * @returns {boolean} returns.isError - Whether any queries have errors
 * @returns {Error|null} returns.error - First error encountered, if any
 * 
 * @example
 * function CorporationIndustryJobsManager() {
 *   const { data: jobsByCorporation, isLoading, isError, error } = useGetAllCorporationIndustryJobs();
 * 
 *   if (isLoading) return <div>Loading industry jobs...</div>;
 *   if (isError) return <div>Error: {error.message}</div>;
 *   return <div>Industry Jobs: {Object.keys(jobsByCorporation).length} corporations with active jobs</div>;
 * }
 */
export default function useGetAllCorporationIndustryJobs() {
  const { userArray } = useUsersStore((state) => state.users);

  const combineFunction = useCallback((results) => {
    const isLoading = checkLoadingState(results);
    const error = findFirstError(results);
    const allJobs = extractIndustryJobsFromResults(results);
    const groupedJobs = groupIndustryJobsByCorporation(allJobs);

    if (isLoading) {
      return createLoadingObject();
    }

    if (error) {
      return createErrorObject(error);
    }

    return createSuccessObject(groupedJobs);
  }, []);

  const result = useQueries({
    queries: userArray.map(({ CharacterHash }) => corporationIndustryJobsQuery(CharacterHash)),
    combine: combineFunction,
  });

  return result;
}

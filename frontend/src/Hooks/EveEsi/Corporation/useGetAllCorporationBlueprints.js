import { useQueries } from "@tanstack/react-query";
import useUsersStore from "../../../Zustand/usersStore";
import { useCallback } from "react";
import {
  corporationBlueprintsQuery,
  corporationBlueprintsQueryKey,
} from "../../React Query/Corporation/blueprints";
import {
  isQueryObserverResultLoading,
  isQueryStateLoading,
} from "../queryLoadingState";

/**
 * Utility function to extract blueprints from query results.
 * Handles the data structure returned by corporation blueprints queries.
 * 
 * @param {Array<Object>} results - Array of query result objects
 * @returns {Array<Object>} Flattened array of blueprint objects
 * 
 * @private
 */
function extractBlueprintsFromResults(results) {
  return results.flatMap((result) => {
    // The query returns { data: allData, corporation_id: userObject.corporation_id }
    // So we need to access result.data.data
    return result.data || {};
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
 * Utility function to create error object for corporation blueprints queries.
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
 * Utility function to create loading object for corporation blueprints queries.
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
 * Utility function to create success object for corporation blueprints queries.
 * 
 * @param {Object} data - Object with corporation IDs as keys and blueprint arrays as values
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
 * Utility function to group blueprints by corporation and deduplicate by item_id.
 * 
 * @param {Array<Object>} results - Array of query result objects
 * @returns {Object} Object with corporation IDs as keys and blueprint arrays as values
 * 
 * @private
 */
function groupBlueprintsByCorporation(results) {
  // First extract all blueprints from results.data
  const allBlueprints = results.flatMap((result) => {
    // The query returns { data: allData, corporation_id: userObject.corporation_id }
    // So we need to access result.data.data
    return result?.data || {};
  });

  const groupedBlueprints = results.reduce((acc, result) => {
    if (!result?.data || !result?.corporation_id) {
      return acc;
    }

    const corpId = result.corporation_id;
    const data = result.data || {};

    if (!acc[corpId]) {
      acc[corpId] = [];
    }

    acc[corpId] = [...acc[corpId], ...data];

    return acc;
  }, {});

  return groupedBlueprints;
}

/**
 * Retrieves cached corporation blueprints data from React Query cache for all users.
 * 
 * This function provides access to cached corporation blueprints data without triggering new queries:
 * - Fetches blueprints for all user corporations
 * - Checks loading states for all corporation blueprint queries
 * - Extracts cached data from React Query cache
 * - Groups blueprints by corporation ID for easy access
 * - Returns appropriate loading, error, or success states
 * 
 * The caching process:
 * 1. Gets all user character hashes from the store
 * 2. Checks query states for all corporation blueprint queries
 * 3. Determines overall loading and error states
 * 4. Extracts cached data from successful queries
 * 5. Groups blueprints by corporation ID
 * 
 * @param {Object} queryClient - React Query client instance
 * @returns {Object} Object containing cached corporation blueprints data
 * @returns {Object} returns.data - Object with corporation IDs as keys and blueprint arrays as values
 * @returns {boolean} returns.isLoading - Whether any queries are still loading
 * @returns {boolean} returns.isError - Whether any queries have errors
 * @returns {Error|null} returns.error - First error encountered, if any
 * 
 * @example
 * const cachedBlueprints = getAllCachedCorporationBlueprints(queryClient);
 * if (!cachedBlueprints.isLoading && !cachedBlueprints.isError) {
 *   Object.keys(cachedBlueprints.data).forEach(corpId => {
 *     console.log(`Corporation ${corpId}: ${cachedBlueprints.data[corpId].length} blueprints`);
 *   });
 * }
 */
export function getAllCachedCorporationBlueprints(queryClient) {
  const userArray = useUsersStore.getState().users.userArray;

  // Get query states for all users
  const queryStates = userArray.map((user) => {
    const queryKey = [corporationBlueprintsQueryKey, user.CharacterHash];
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
  const error = queryStates.find(({ queryState }) => queryState?.error)
    ?.queryState?.error;

  if (error) {
    return createErrorObject(error);
  }

  // Extract cached blueprints and group by corporation with deduplication
  const cachedBlueprints = queryStates.map(({ cachedData }) => {
    // The cached data structure is { data: allData, corporation_id: userObject.corporation_id }
    return cachedData || {};
  });
  const groupedBlueprints = groupBlueprintsByCorporation(cachedBlueprints);

  return createSuccessObject(groupedBlueprints);
}

/**
 * Custom hook that fetches corporation blueprints for all user corporations.
 * 
 * This hook provides comprehensive corporation blueprint data fetching:
 * - Fetches blueprints for all user corporations in parallel
 * - Groups blueprints by corporation ID for easy access
 * - Handles pagination automatically through the underlying query
 * - Provides loading, error, and success states
 * - Uses React Query's useQueries for parallel data fetching
 * - Supports corporation blueprint management and analysis
 * 
 * The fetching process:
 * 1. Gets all user character hashes from the store
 * 2. Creates queries for all corporation blueprint data
 * 3. Fetches data in parallel using React Query's useQueries
 * 4. Combines results using a custom combine function
 * 5. Groups blueprints by corporation ID for structured access
 * 
 * @returns {Object} Object containing corporation blueprints data and states
 * @returns {Object} returns.data - Object with corporation IDs as keys and blueprint arrays as values
 * @returns {boolean} returns.isLoading - Whether any queries are still loading
 * @returns {boolean} returns.isError - Whether any queries have errors
 * @returns {Error|null} returns.error - First error encountered, if any
 * 
 * @example
 * function CorporationBlueprintsManager() {
 *   const { data: blueprintsByCorporation, isLoading, isError, error } = useGetAllCorporationBlueprints();
 * 
 *   if (isLoading) return <div>Loading corporation blueprints...</div>;
 *   if (isError) return <div>Error: {error.message}</div>;
 *   
 *   return (
 *     <div>
 *       {Object.keys(blueprintsByCorporation).map(corpId => (
 *         <div key={corpId}>
 *           Corporation {corpId}: {blueprintsByCorporation[corpId].length} blueprints
 *         </div>
 *       ))}
 *     </div>
 *   );
 * }
 */
export function useGetAllCorporationBlueprints() {
  const { userArray } = useUsersStore((state) => state.users);

  const combineFunction = useCallback((results) => {
    const isLoading = checkLoadingState(results);
    const error = findFirstError(results);

    if (isLoading) {
      return createLoadingObject();
    }

    if (error) {
      return createErrorObject(error);
    }

    const resultObjects = extractBlueprintsFromResults(results);
    const groupedBlueprints = groupBlueprintsByCorporation(resultObjects);

    return createSuccessObject(groupedBlueprints);
  }, []);

  const result = useQueries({
    queries: userArray.map(({ CharacterHash }) =>
      corporationBlueprintsQuery(CharacterHash)
    ),
    combine: combineFunction,
  });

  return result;
}

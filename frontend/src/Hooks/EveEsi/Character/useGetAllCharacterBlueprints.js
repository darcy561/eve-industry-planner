import { useQueries } from "@tanstack/react-query";
import useUsersStore from "../../../Zustand/usersStore";
import { useCallback } from "react";
import { characterBlueprintsQuery, characterBlueprintsQueryKey } from "../../React Query/Character/blueprints";

/**
 * Utility function to extract blueprints from query results.
 * Handles the data structure returned by character blueprints queries.
 * 
 * @param {Array<Object>} results - Array of query result objects
 * @returns {Array<Object>} Flattened array of blueprint objects
 * 
 * @private
 */
function extractBlueprintsFromResults(results) {
  return results.flatMap((result) => {
    // The query returns { data: allData, characterHash: characterHash }
    // So we need to access result.data
    return result.data || [];
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
  return results.some((result) => result.isLoading);
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
 * Utility function to create error object for character blueprints queries.
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
 * Utility function to create loading object for character blueprints queries.
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
 * Utility function to create success object for character blueprints queries.
 * 
 * @param {Object} data - Object with character hashes as keys and blueprint arrays as values
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
 * Retrieves cached character blueprints data from React Query cache for all users.
 * 
 * This function provides access to cached character blueprints data without triggering new queries:
 * - Fetches blueprints for all user characters
 * - Checks loading states for all character blueprint queries
 * - Extracts cached data from React Query cache
 * - Organizes data by character hash for easy access
 * - Returns appropriate loading, error, or success states
 * 
 * The caching process:
 * 1. Gets all user character hashes from the store
 * 2. Checks query states for all character blueprint queries
 * 3. Determines overall loading and error states
 * 4. Extracts cached data from successful queries
 * 5. Organizes data by character hash
 * 
 * @param {Object} queryClient - React Query client instance
 * @returns {Object} Object containing cached character blueprints data
 * @returns {Object} returns.data - Object with character hashes as keys and blueprint arrays as values
 * @returns {boolean} returns.isLoading - Whether any queries are still loading
 * @returns {boolean} returns.isError - Whether any queries have errors
 * @returns {Error|null} returns.error - First error encountered, if any
 * 
 * @example
 * const cachedBlueprints = getAllCachedCharacterBlueprints(queryClient);
 * if (!cachedBlueprints.isLoading && !cachedBlueprints.isError) {
 *   Object.keys(cachedBlueprints.data).forEach(characterHash => {
 *     console.log(`Character ${characterHash}: ${cachedBlueprints.data[characterHash].length} blueprints`);
 *   });
 * }
 */
export function getAllCachedCharacterBlueprints(queryClient) {
  const userArray = useUsersStore.getState().users.userArray;

  // Get query states for all characters
  const queryStates = userArray.map(({ CharacterHash }) => {
    const queryKey = [characterBlueprintsQueryKey, CharacterHash];
    return {
      CharacterHash,
      queryState: queryClient.getQueryState(queryKey),
      cachedData: queryClient.getQueryData(queryKey),
    };
  });

  // Check loading state
  const isLoading = queryStates.some(({ queryState }) =>
    queryState?.status === "loading" || !queryState
  );

  if (isLoading) {
    return createLoadingObject();
  }

  // Check for errors
  const error = queryStates.find(({ queryState }) => queryState?.error)?.queryState?.error;

  if (error) {
    return createErrorObject(error);
  }

  // Extract cached blueprints organized by character hash
  const blueprintsByCharacter = {};
  queryStates.forEach(({ CharacterHash, cachedData }) => {
    // The cached data structure is { data: allData, characterHash: characterHash }
    const characterBlueprints = cachedData?.data || [];
    blueprintsByCharacter[CharacterHash] = characterBlueprints;
  });

  return createSuccessObject(blueprintsByCharacter);
}

/**
 * Custom hook that fetches character blueprints for all user characters.
 * 
 * This hook provides comprehensive character blueprint data fetching:
 * - Fetches blueprints for all user characters in parallel
 * - Organizes blueprints by character hash for easy access
 * - Handles pagination automatically through the underlying query
 * - Provides loading, error, and success states
 * - Uses React Query's useQueries for parallel data fetching
 * - Supports blueprint data analysis and management
 * 
 * The fetching process:
 * 1. Gets all user character hashes from the store
 * 2. Creates queries for all character blueprint data
 * 3. Fetches data in parallel using React Query's useQueries
 * 4. Combines results using a custom combine function
 * 5. Organizes data by character hash for structured access
 * 
 * @returns {Object} Object containing character blueprints data and states
 * @returns {Object} returns.data - Object with character hashes as keys and blueprint arrays as values
 * @returns {boolean} returns.isLoading - Whether any queries are still loading
 * @returns {boolean} returns.isError - Whether any queries have errors
 * @returns {Error|null} returns.error - First error encountered, if any
 * 
 * @example
 * function CharacterBlueprintsManager() {
 *   const { data: blueprintsByCharacter, isLoading, isError, error } = useGetAllCharacterBlueprints();
 * 
 *   if (isLoading) return <div>Loading character blueprints...</div>;
 *   if (isError) return <div>Error: {error.message}</div>;
 *   
 *   return (
 *     <div>
 *       {Object.keys(blueprintsByCharacter).map(characterHash => (
 *         <div key={characterHash}>
 *           Character {characterHash}: {blueprintsByCharacter[characterHash].length} blueprints
 *         </div>
 *       ))}
 *     </div>
 *   );
 * }
 */
export function useGetAllCharacterBlueprints() {
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

    // Organize blueprints by character hash
    const blueprintsByCharacter = {};
    results.forEach((result, index) => {
      const { CharacterHash } = userArray[index];
      // Extract blueprints from the single result object
      // The query returns { data: allData, characterHash: characterHash }
      const characterBlueprints = result.data || [];
      blueprintsByCharacter[CharacterHash] = characterBlueprints;
    });

    return createSuccessObject(blueprintsByCharacter);
  }, [userArray]);

  const result = useQueries({
    queries: userArray.map(({ CharacterHash }) => characterBlueprintsQuery(CharacterHash)),
    combine: combineFunction,
  });

  return result;
}

import { useQueries } from "@tanstack/react-query";
import useUsersStore from "../../../Zustand/usersStore";
import { useCallback } from "react";
import { characterMarketOrdersQuery, characterMarketOrdersQueryKey } from "../../React Query/Character/marketOrders";

/**
 * Utility function to extract market orders from query results and organize by character hash.
 * 
 * @param {Array<Object>} results - Array of query result objects
 * @param {Array<Object>} userArray - Array of user objects with CharacterHash
 * @returns {Object} Object with character hashes as keys and market order arrays as values
 * 
 * @private
 */
function extractMarketOrdersByCharacter(results, userArray) {
  const marketOrdersObject = {};
  
  results.forEach((result, index) => {
    const characterHash = userArray[index]?.CharacterHash;
    if (characterHash) {
      // characterMarketOrdersQuery returns data directly as an array, not in a paginated structure
      const characterOrders = result.data || [];
      marketOrdersObject[characterHash] = characterOrders;
    }
  });
  
  return marketOrdersObject;
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
 * Utility function to create error object for character market orders queries.
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
 * Utility function to create loading object for character market orders queries.
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
 * Utility function to create success object for character market orders queries.
 * 
 * @param {Object} data - Object with character hashes as keys and market order arrays as values
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
 * Utility function to sort market orders by date (newest first).
 * 
 * @param {Array<Object>} marketOrders - Array of market order objects
 * @returns {Array<Object>} Sorted array of market order objects
 * 
 * @private
 */
function sortMarketOrdersByDate(marketOrders) {
  return marketOrders.sort((a, b) => Date.parse(b.issued) - Date.parse(a.issued));
}

/**
 * Retrieves cached character market orders data from React Query cache for all users.
 * 
 * This function provides access to cached character market orders data without triggering new queries:
 * - Fetches market orders for all user characters
 * - Checks loading states for all character market order queries
 * - Extracts cached data from React Query cache
 * - Organizes data by character hash for easy access
 * - Returns appropriate loading, error, or success states
 * 
 * The caching process:
 * 1. Gets all user character hashes from the store
 * 2. Checks query states for all character market order queries
 * 3. Determines overall loading and error states
 * 4. Extracts cached data from successful queries
 * 5. Organizes data by character hash
 * 
 * @param {Object} queryClient - React Query client instance
 * @returns {Object} Object containing cached character market orders data
 * @returns {Object} returns.data - Object with character hashes as keys and market order arrays as values
 * @returns {boolean} returns.isLoading - Whether any queries are still loading
 * @returns {boolean} returns.isError - Whether any queries have errors
 * @returns {Error|null} returns.error - First error encountered, if any
 * 
 * @example
 * const cachedOrders = getAllCachedCharacterMarketOrders(queryClient);
 * if (!cachedOrders.isLoading && !cachedOrders.isError) {
 *   Object.keys(cachedOrders.data).forEach(characterHash => {
 *     console.log(`Character ${characterHash}: ${cachedOrders.data[characterHash].length} market orders`);
 *   });
 * }
 */
export function getAllCachedCharacterMarketOrders(queryClient) {
  const userArray = useUsersStore.getState().users.userArray;

  // Get query states for all characters
  const queryStates = userArray.map(({ CharacterHash }) => {
    const queryKey = [characterMarketOrdersQueryKey, CharacterHash];
    return {
      queryState: queryClient.getQueryState(queryKey),
      cachedData: queryClient.getQueryData(queryKey),
      CharacterHash,
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
  
  // Extract cached market orders and organize by character hash
  const marketOrdersObject = {};
  queryStates.forEach(({ cachedData, CharacterHash }) => {
    const characterOrders = cachedData || [];
    marketOrdersObject[CharacterHash] = characterOrders;
  });

  return createSuccessObject(marketOrdersObject);
}

/**
 * Custom hook that fetches character market orders for all user characters.
 * 
 * This hook provides comprehensive character market orders data fetching:
 * - Fetches market orders for all user characters in parallel
 * - Organizes orders by character hash for easy access
 * - Handles pagination automatically through the underlying query
 * - Provides loading, error, and success states
 * - Uses React Query's useQueries for parallel data fetching
 * - Supports active market order management and analysis
 * 
 * The fetching process:
 * 1. Gets all user character hashes from the store
 * 2. Creates queries for all character market order data
 * 3. Fetches data in parallel using React Query's useQueries
 * 4. Combines results using a custom combine function
 * 5. Organizes data by character hash for structured access
 * 
 * @returns {Object} Object containing character market orders data and states
 * @returns {Object} returns.data - Object with character hashes as keys and market order arrays as values
 * @returns {boolean} returns.isLoading - Whether any queries are still loading
 * @returns {boolean} returns.isError - Whether any queries have errors
 * @returns {Error|null} returns.error - First error encountered, if any
 * 
 * @example
 * function CharacterMarketOrdersManager() {
 *   const { data: ordersByCharacter, isLoading, isError, error } = useGetAllCharacterMarketOrders();
 * 
 *   if (isLoading) return <div>Loading market orders...</div>;
 *   if (isError) return <div>Error: {error.message}</div>;
 *   
 *   return (
 *     <div>
 *       {Object.keys(ordersByCharacter).map(characterHash => (
 *         <div key={characterHash}>
 *           Character {characterHash}: {ordersByCharacter[characterHash].length} active orders
 *         </div>
 *       ))}
 *     </div>
 *   );
 * }
 */
export function useGetAllCharacterMarketOrders() {
  const { userArray } = useUsersStore((state) => state.users);

  const combineFunction = useCallback((results) => {
    const isLoading = checkLoadingState(results);
    const error = findFirstError(results);
    const marketOrdersObject = extractMarketOrdersByCharacter(results, userArray);

    if (isLoading) {
      return createLoadingObject();
    }

    if (error) {
      return createErrorObject(error);
    }

    return createSuccessObject(marketOrdersObject);
  }, [userArray]);

  const result = useQueries({
    queries: userArray.map(({ CharacterHash }) => characterMarketOrdersQuery(CharacterHash)),
    combine: combineFunction,
  });

  return result;
}

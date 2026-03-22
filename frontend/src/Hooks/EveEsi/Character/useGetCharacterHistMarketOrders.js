import { useQuery } from "@tanstack/react-query";
import { characterHistMarketOrdersQuery, characterHistMarketOrdersQueryKey } from "../React Query/Character/histMarketOrders";
import { isQueryStateLoading } from "../queryLoadingState";

/**
 * Custom hook that fetches character historic market orders for a specific character.
 * 
 * This hook provides character historic market orders data fetching for EVE Online characters:
 * - Fetches completed market orders for the specified character
 * - Returns historic market orders data with character hash for identification
 * - Handles pagination automatically through the underlying query
 * - Provides loading, error, and success states
 * - Uses React Query for caching and background updates
 * 
 * The fetching process:
 * 1. Uses React Query to fetch character historic market orders
 * 2. Handles pagination and data combination automatically
 * 3. Returns structured data with character hash
 * 4. Provides loading and error states
 * 
 * @param {Object} userObject - User object containing character information
 * @param {string} userObject.CharacterHash - Character hash identifier for the user
 * @returns {Object} Object containing character historic market orders data and states
 * @returns {Object} returns.data - Object with historic market orders data and characterHash
 * @returns {Array<Object>} returns.data.data - Array of historic market order objects
 * @returns {string} returns.data.characterHash - Character hash for the orders
 * @returns {boolean} returns.isLoading - Whether the query is still loading
 * @returns {boolean} returns.isError - Whether the query has an error
 * @returns {Error|null} returns.error - Error object if an error occurred
 * 
 * @example
 * function CharacterHistoricOrders() {
 *   const { data: historicOrders, isLoading, isError } = useGetCharacterHistMarketOrders(userObject);
 * 
 *   if (isLoading) return <div>Loading historic market orders...</div>;
 *   if (isError) return <div>Error loading historic orders</div>;
 *   return (
 *     <div>
 *       <div>Character: {historicOrders.characterHash}</div>
 *       <div>Historic Orders: {historicOrders.data.length} completed orders</div>
 *     </div>
 *   );
 * }
 */
export function useGetCharacterHistMarketOrders(userObject) {
    return useQuery(characterHistMarketOrdersQuery(userObject));
}

/**
 * Retrieves cached character historic market orders data from React Query cache for a specific character.
 * 
 * This function provides access to cached character historic market orders data without triggering new queries:
 * - Checks query state for the character historic market orders query
 * - Extracts cached data from React Query cache
 * - Returns appropriate loading, error, or success states
 * - Handles cases where query state doesn't exist
 * 
 * The caching process:
 * 1. Gets query state for the character historic market orders query
 * 2. Determines loading, error, or success state
 * 3. Extracts cached data from successful queries
 * 4. Returns structured data with appropriate states
 * 
 * @param {Object} queryClient - React Query client instance
 * @param {Object} userObject - User object containing character information
 * @param {string} userObject.CharacterHash - Character hash identifier for the user
 * @returns {Object} Object containing cached character historic market orders data
 * @returns {Object} returns.data - Object with cached historic market orders data and characterHash
 * @returns {boolean} returns.isLoading - Whether the query is still loading
 * @returns {boolean} returns.isError - Whether the query has an error
 * @returns {Error|null} returns.error - Error object if an error occurred
 * 
 * @example
 * const cachedHistoricOrders = getCachedCharacterHistMarketOrders(queryClient, userObject);
 * if (!cachedHistoricOrders.isLoading && !cachedHistoricOrders.isError) {
 *   console.log(`Cached historic orders: ${cachedHistoricOrders.data.data.length} completed orders for ${cachedHistoricOrders.data.characterHash}`);
 * }
 */
export function getCachedCharacterHistMarketOrders(queryClient, userObject) {
    const queryState = queryClient.getQueryState([characterHistMarketOrdersQueryKey, userObject.CharacterHash]);

    if (isQueryStateLoading(queryState)) {
        return { data: [], isLoading: true, isError: false };
    }

    if (queryState?.error) {
        return { data: [], isLoading: false, isError: queryState.error };
    }

    const cachedHistMarketOrders = queryClient.getQueryData([
        characterHistMarketOrdersQueryKey,
        userObject.CharacterHash,
    ]);

    return { data: cachedHistMarketOrders, isLoading: false, isError: false };
}   
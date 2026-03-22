import { useQuery } from "@tanstack/react-query";
import { characterMarketOrdersQuery, characterMarketOrdersQueryKey } from "../React Query/Character/marketOrders";
import { isQueryStateLoading } from "../queryLoadingState";

/**
 * Custom hook that fetches character market orders for a specific character.
 * 
 * This hook provides character market orders data fetching for EVE Online characters:
 * - Fetches active market orders for the specified character
 * - Returns market orders data with character hash for identification
 * - Handles pagination automatically through the underlying query
 * - Provides loading, error, and success states
 * - Uses React Query for caching and background updates
 * 
 * The fetching process:
 * 1. Uses React Query to fetch character market orders
 * 2. Handles pagination and data combination automatically
 * 3. Returns structured data with character hash
 * 4. Provides loading and error states
 * 
 * @param {Object} userObject - User object containing character information
 * @param {string} userObject.CharacterHash - Character hash identifier for the user
 * @returns {Object} Object containing character market orders data and states
 * @returns {Object} returns.data - Object with market orders data and characterHash
 * @returns {Array<Object>} returns.data.data - Array of market order objects
 * @returns {string} returns.data.characterHash - Character hash for the orders
 * @returns {boolean} returns.isLoading - Whether the query is still loading
 * @returns {boolean} returns.isError - Whether the query has an error
 * @returns {Error|null} returns.error - Error object if an error occurred
 * 
 * @example
 * function CharacterMarketOrders() {
 *   const { data: marketOrders, isLoading, isError } = useGetCharacterMarketOrders(userObject);
 * 
 *   if (isLoading) return <div>Loading market orders...</div>;
 *   if (isError) return <div>Error loading market orders</div>;
 *   return (
 *     <div>
 *       <div>Character: {marketOrders.characterHash}</div>
 *       <div>Market Orders: {marketOrders.data.length} active orders</div>
 *     </div>
 *   );
 * }
 */
export function useGetCharacterMarketOrders(userObject) {
    return useQuery(characterMarketOrdersQuery(userObject));
}

/**
 * Retrieves cached character market orders data from React Query cache for a specific character.
 * 
 * This function provides access to cached character market orders data without triggering new queries:
 * - Checks query state for the character market orders query
 * - Extracts cached data from React Query cache
 * - Returns appropriate loading, error, or success states
 * - Handles cases where query state doesn't exist
 * 
 * The caching process:
 * 1. Gets query state for the character market orders query
 * 2. Determines loading, error, or success state
 * 3. Extracts cached data from successful queries
 * 4. Returns structured data with appropriate states
 * 
 * @param {Object} queryClient - React Query client instance
 * @param {Object} userObject - User object containing character information
 * @param {string} userObject.CharacterHash - Character hash identifier for the user
 * @returns {Object} Object containing cached character market orders data
 * @returns {Object} returns.data - Object with cached market orders data and characterHash
 * @returns {boolean} returns.isLoading - Whether the query is still loading
 * @returns {boolean} returns.isError - Whether the query has an error
 * @returns {Error|null} returns.error - Error object if an error occurred
 * 
 * @example
 * const cachedMarketOrders = getCachedCharacterMarketOrders(queryClient, userObject);
 * if (!cachedMarketOrders.isLoading && !cachedMarketOrders.isError) {
 *   console.log(`Cached market orders: ${cachedMarketOrders.data.data.length} active orders for ${cachedMarketOrders.data.characterHash}`);
 * }
 */
export function getCachedCharacterMarketOrders(queryClient, userObject) {
    const queryState = queryClient.getQueryState([characterMarketOrdersQueryKey, userObject.CharacterHash]);

    if (isQueryStateLoading(queryState)) {
        return { data: [], isLoading: true, isError: false };
    }

    if (queryState?.error) {
        return { data: [], isLoading: false, isError: queryState.error };
    }

    const cachedMarketOrders = queryClient.getQueryData([
        characterMarketOrdersQueryKey,
        userObject.CharacterHash,
    ]);

    return { data: cachedMarketOrders, isLoading: false, isError: false };
}   
import { useQuery } from "@tanstack/react-query"
import { corporationHistoricMarketOrdersQuery, corporationHistoricMarketOrdersQueryKey } from "../../React Query/Corporation/historicMarketOrders"
import { isQueryStateLoading } from "../queryLoadingState";

/**
 * Custom hook that fetches corporation historic market orders for a specific character.
 * 
 * This hook provides corporation historic market orders data fetching for EVE Online corporations:
 * - Fetches completed market orders for the corporation accessible to the character
 * - Returns historic market orders data with corporation ID for identification
 * - Handles pagination automatically through the underlying query
 * - Provides loading, error, and success states
 * - Uses React Query for caching and background updates
 * 
 * The fetching process:
 * 1. Uses React Query to fetch corporation historic market orders
 * 2. Handles pagination and data combination automatically
 * 3. Returns structured data with corporation ID
 * 4. Provides loading and error states
 * 
 * @param {string} characterHash - Character hash identifier for the user
 * @returns {Object} Object containing corporation historic market orders data and states
 * @returns {Object} returns.data - Object with historic market orders data and corporation_id
 * @returns {Array<Object>} returns.data.data - Array of historic market order objects
 * @returns {number} returns.data.corporation_id - Corporation ID for the orders
 * @returns {boolean} returns.isLoading - Whether the query is still loading
 * @returns {boolean} returns.isError - Whether the query has an error
 * @returns {Error|null} returns.error - Error object if an error occurred
 * 
 * @example
 * function CorporationHistoricOrders() {
 *   const { data: historicOrders, isLoading, isError } = useGetCorporationHistoricMarketOrders(characterHash);
 * 
 *   if (isLoading) return <div>Loading historic market orders...</div>;
 *   if (isError) return <div>Error loading historic orders</div>;
 *   return (
 *     <div>
 *       <div>Corporation ID: {historicOrders.corporation_id}</div>
 *       <div>Historic Orders: {historicOrders.data.length} completed orders</div>
 *     </div>
 *   );
 * }
 */
export function useGetCorporationHistoricMarketOrders(characterHash) {
    return useQuery(corporationHistoricMarketOrdersQuery(characterHash))
}


/**
 * Retrieves cached corporation historic market orders data from React Query cache for a specific character.
 * 
 * This function provides access to cached corporation historic market orders data without triggering new queries:
 * - Checks query state for the corporation historic market orders query
 * - Extracts cached data from React Query cache
 * - Returns appropriate loading, error, or success states
 * - Handles cases where query state doesn't exist
 * 
 * The caching process:
 * 1. Gets query state for the corporation historic market orders query
 * 2. Determines loading, error, or success state
 * 3. Extracts cached data from successful queries
 * 4. Returns structured data with appropriate states
 * 
 * @param {Object} queryClient - React Query client instance
 * @param {string} characterHash - Character hash identifier for the user
 * @returns {Object} Object containing cached corporation historic market orders data
 * @returns {Object} returns.data - Object with cached historic market orders data and corporation_id
 * @returns {boolean} returns.isLoading - Whether the query is still loading
 * @returns {boolean} returns.isError - Whether the query has an error
 * @returns {Error|null} returns.error - Error object if an error occurred
 * 
 * @example
 * const cachedHistoricOrders = getCachedCorporationHistoricMarketOrders(queryClient, characterHash);
 * if (!cachedHistoricOrders.isLoading && !cachedHistoricOrders.isError) {
 *   console.log(`Cached historic orders: ${cachedHistoricOrders.data.data.length} completed orders for corp ${cachedHistoricOrders.data.corporation_id}`);
 * }
 */
export function getCachedCorporationHistoricMarketOrders(queryClient, characterHash) {
    const queryState = queryClient.getQueryState([corporationHistoricMarketOrdersQueryKey, characterHash])

    if (isQueryStateLoading(queryState)) {
        return { data: {}, isLoading: true, isError: false }
    }

    if (queryState?.error) {
        return { data: {}, isLoading: false, isError: queryState.error }
    }

    const cachedHistoricMarketOrders = queryClient.getQueryData([corporationHistoricMarketOrdersQueryKey, characterHash])

    return { data: cachedHistoricMarketOrders, isLoading: false, isError: false }
}



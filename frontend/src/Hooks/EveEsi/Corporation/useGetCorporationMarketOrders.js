import { useQuery } from "@tanstack/react-query"
import { corporationMarketOrdersQuery, corporationMarketOrdersQueryKey } from "../../React Query/Corporation/marketOrders"

/**
 * Custom hook that fetches corporation market orders for a specific character.
 * 
 * This hook provides corporation market orders data fetching for EVE Online corporations:
 * - Fetches active market orders for the corporation accessible to the character
 * - Returns market orders data with corporation ID for identification
 * - Handles pagination automatically through the underlying query
 * - Provides loading, error, and success states
 * - Uses React Query for caching and background updates
 * 
 * The fetching process:
 * 1. Uses React Query to fetch corporation market orders
 * 2. Handles pagination and data combination automatically
 * 3. Returns structured data with corporation ID
 * 4. Provides loading and error states
 * 
 * @param {string} characterHash - Character hash identifier for the user
 * @returns {Object} Object containing corporation market orders data and states
 * @returns {Object} returns.data - Object with market orders data and corporation_id
 * @returns {Array<Object>} returns.data.data - Array of market order objects
 * @returns {number} returns.data.corporation_id - Corporation ID for the orders
 * @returns {boolean} returns.isLoading - Whether the query is still loading
 * @returns {boolean} returns.isError - Whether the query has an error
 * @returns {Error|null} returns.error - Error object if an error occurred
 * 
 * @example
 * function CorporationMarketOrders() {
 *   const { data: marketOrders, isLoading, isError } = useGetCorporationMarketOrders(characterHash);
 * 
 *   if (isLoading) return <div>Loading market orders...</div>;
 *   if (isError) return <div>Error loading market orders</div>;
 *   return (
 *     <div>
 *       <div>Corporation ID: {marketOrders.corporation_id}</div>
 *       <div>Market Orders: {marketOrders.data.length} active orders</div>
 *     </div>
 *   );
 * }
 */
function useGetCorporationMarketOrders(characterHash) {
    return useQuery(corporationMarketOrdersQuery(characterHash))
}


/**
 * Retrieves cached corporation market orders data from React Query cache for a specific character.
 * 
 * This function provides access to cached corporation market orders data without triggering new queries:
 * - Checks query state for the corporation market orders query
 * - Extracts cached data from React Query cache
 * - Returns appropriate loading, error, or success states
 * - Handles cases where query state doesn't exist
 * 
 * The caching process:
 * 1. Gets query state for the corporation market orders query
 * 2. Determines loading, error, or success state
 * 3. Extracts cached data from successful queries
 * 4. Returns structured data with appropriate states
 * 
 * @param {Object} queryClient - React Query client instance
 * @param {string} characterHash - Character hash identifier for the user
 * @returns {Object} Object containing cached corporation market orders data
 * @returns {Object} returns.data - Object with cached market orders data and corporation_id
 * @returns {boolean} returns.isLoading - Whether the query is still loading
 * @returns {boolean} returns.isError - Whether the query has an error
 * @returns {Error|null} returns.error - Error object if an error occurred
 * 
 * @example
 * const cachedMarketOrders = getCachedCorporationMarketOrders(queryClient, characterHash);
 * if (!cachedMarketOrders.isLoading && !cachedMarketOrders.isError) {
 *   console.log(`Cached market orders: ${cachedMarketOrders.data.data.length} active orders for corp ${cachedMarketOrders.data.corporation_id}`);
 * }
 */
function getCachedCorporationMarketOrders(queryClient, characterHash) {
    const queryState = queryClient.getQueryState([corporationMarketOrdersQueryKey, characterHash])

    if (queryState?.status === "loading" || !queryState) {
        return { data: {}, isLoading: true, isError: false }
    }

    if (queryState?.error) {
        return { data: {}, isLoading: false, isError: queryState.error }
    }

    const cachedMarketOrders = queryClient.getQueryData([corporationMarketOrdersQueryKey, characterHash])

    return { data: cachedMarketOrders, isLoading: false, isError: false }
}


export { useGetCorporationMarketOrders, getCachedCorporationMarketOrders }
    
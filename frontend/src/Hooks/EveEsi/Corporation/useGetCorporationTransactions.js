import { useQuery } from "@tanstack/react-query"
import { corporationTransactionsQuery, corporationTransactionsQueryKey } from "../React Query/Corporation/transactions"

/**
 * Custom hook that fetches corporation transactions for a specific character.
 * 
 * This hook provides corporation transactions data fetching for EVE Online corporations:
 * - Fetches transaction history for the corporation accessible to the character
 * - Returns transaction data with corporation ID for identification
 * - Handles pagination automatically through the underlying query
 * - Provides loading, error, and success states
 * - Uses React Query for caching and background updates
 * 
 * The fetching process:
 * 1. Uses React Query to fetch corporation transactions
 * 2. Handles pagination and data combination automatically
 * 3. Returns structured data with corporation ID
 * 4. Provides loading and error states
 * 
 * @param {string} characterHash - Character hash identifier for the user
 * @returns {Object} Object containing corporation transactions data and states
 * @returns {Object} returns.data - Object with transactions data and corporation_id
 * @returns {Array<Object>} returns.data.data - Array of transaction objects
 * @returns {number} returns.data.corporation_id - Corporation ID for the transactions
 * @returns {boolean} returns.isLoading - Whether the query is still loading
 * @returns {boolean} returns.isError - Whether the query has an error
 * @returns {Error|null} returns.error - Error object if an error occurred
 * 
 * @example
 * function CorporationTransactions() {
 *   const { data: transactions, isLoading, isError } = useGetCorporationTransactions(characterHash);
 * 
 *   if (isLoading) return <div>Loading transactions...</div>;
 *   if (isError) return <div>Error loading transactions</div>;
 *   return (
 *     <div>
 *       <div>Corporation ID: {transactions.corporation_id}</div>
 *       <div>Transactions: {transactions.data.length} transactions</div>
 *     </div>
 *   );
 * }
 */
function useGetCorporationTransactions(characterHash) {
    return useQuery(corporationTransactionsQuery(characterHash))
}

/**
 * Retrieves cached corporation transactions data from React Query cache for a specific character.
 * 
 * This function provides access to cached corporation transactions data without triggering new queries:
 * - Checks query state for the corporation transactions query
 * - Extracts cached data from React Query cache
 * - Returns appropriate loading, error, or success states
 * - Handles cases where query state doesn't exist
 * 
 * The caching process:
 * 1. Gets query state for the corporation transactions query
 * 2. Determines loading, error, or success state
 * 3. Extracts cached data from successful queries
 * 4. Returns structured data with appropriate states
 * 
 * @param {Object} queryClient - React Query client instance
 * @param {string} characterHash - Character hash identifier for the user
 * @returns {Object} Object containing cached corporation transactions data
 * @returns {Object} returns.data - Object with cached transactions data and corporation_id
 * @returns {boolean} returns.isLoading - Whether the query is still loading
 * @returns {boolean} returns.isError - Whether the query has an error
 * @returns {Error|null} returns.error - Error object if an error occurred
 * 
 * @example
 * const cachedTransactions = getCachedCorporationTransactions(queryClient, characterHash);
 * if (!cachedTransactions.isLoading && !cachedTransactions.isError) {
 *   console.log(`Cached transactions: ${cachedTransactions.data.data.length} transactions for corp ${cachedTransactions.data.corporation_id}`);
 * }
 */
function getCachedCorporationTransactions(queryClient, characterHash) {
    const queryState = queryClient.getQueryState([corporationTransactionsQueryKey, characterHash])

    if (queryState?.status === "loading" || !queryState) {
        return { data: {}, isLoading: true, isError: false }
    }

    if (queryState?.error) {
        return { data: {}, isLoading: false, isError: queryState.error }
    }

    const cachedTransactions = queryClient.getQueryData([corporationTransactionsQueryKey, characterHash])

    return { data: cachedTransactions, isLoading: false, isError: false }

}
export { useGetCorporationTransactions, getCachedCorporationTransactions }
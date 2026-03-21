import { useQuery } from "@tanstack/react-query";
import { characterTransactionsQuery, characterTransactionsQueryKey } from "../../React Query/Character/transactions"
import { isQueryStateLoading } from "../queryLoadingState";

/**
 * Custom hook that fetches character transactions for a specific character.
 * 
 * This hook provides character transactions data fetching for EVE Online characters:
 * - Fetches transaction history for the specified character
 * - Returns transaction data with character hash for identification
 * - Handles pagination automatically through the underlying query
 * - Provides loading, error, and success states
 * - Uses React Query for caching and background updates
 * 
 * The fetching process:
 * 1. Uses React Query to fetch character transactions
 * 2. Handles pagination and data combination automatically
 * 3. Returns structured data with character hash
 * 4. Provides loading and error states
 * 
 * @param {Object} userObject - User object containing character information
 * @param {string} userObject.CharacterHash - Character hash identifier for the user
 * @returns {Object} Object containing character transactions data and states
 * @returns {Object} returns.data - Object with transactions data and characterHash
 * @returns {Array<Object>} returns.data.data - Array of transaction objects
 * @returns {string} returns.data.characterHash - Character hash for the transactions
 * @returns {boolean} returns.isLoading - Whether the query is still loading
 * @returns {boolean} returns.isError - Whether the query has an error
 * @returns {Error|null} returns.error - Error object if an error occurred
 * 
 * @example
 * function CharacterTransactions() {
 *   const { data: transactions, isLoading, isError } = useGetCharacterTransactions(userObject);
 * 
 *   if (isLoading) return <div>Loading transactions...</div>;
 *   if (isError) return <div>Error loading transactions</div>;
 *   return (
 *     <div>
 *       <div>Character: {transactions.characterHash}</div>
 *       <div>Transactions: {transactions.data.length} transactions</div>
 *     </div>
 *   );
 * }
 */
export function useGetCharacterTransactions(userObject) {
    return useQuery(characterTransactionsQuery(userObject));
}

/**
 * Retrieves cached character transactions data from React Query cache for a specific character.
 * 
 * This function provides access to cached character transactions data without triggering new queries:
 * - Checks query state for the character transactions query
 * - Extracts cached data from React Query cache
 * - Returns appropriate loading, error, or success states
 * - Handles cases where query state doesn't exist
 * 
 * The caching process:
 * 1. Gets query state for the character transactions query
 * 2. Determines loading, error, or success state
 * 3. Extracts cached data from successful queries
 * 4. Returns structured data with appropriate states
 * 
 * @param {Object} queryClient - React Query client instance
 * @param {Object} userObject - User object containing character information
 * @param {string} userObject.CharacterHash - Character hash identifier for the user
 * @returns {Object} Object containing cached character transactions data
 * @returns {Object} returns.data - Object with cached transactions data and characterHash
 * @returns {boolean} returns.isLoading - Whether the query is still loading
 * @returns {boolean} returns.isError - Whether the query has an error
 * @returns {Error|null} returns.error - Error object if an error occurred
 * 
 * @example
 * const cachedTransactions = getCachedCharacterTransactions(queryClient, userObject);
 * if (!cachedTransactions.isLoading && !cachedTransactions.isError) {
 *   console.log(`Cached transactions: ${cachedTransactions.data.data.length} transactions for ${cachedTransactions.data.characterHash}`);
 * }
 */
export function getCachedCharacterTransactions(queryClient, userObject) {
    const queryState = queryClient.getQueryState([characterTransactionsQueryKey, userObject.CharacterHash]);

    if (isQueryStateLoading(queryState)) {
        return { data: [], isLoading: true, isError: false };
    }

    if (queryState?.error) {
        return { data: [], isLoading: false, isError: queryState.error };
    }   

    const cachedTransactions = queryClient.getQueryData([
        characterTransactionsQueryKey,
        userObject.CharacterHash,
    ]); 

    return { data: cachedTransactions, isLoading: false, isError: false };
}   
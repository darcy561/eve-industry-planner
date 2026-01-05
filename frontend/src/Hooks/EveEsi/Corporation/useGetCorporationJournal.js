import { useQuery } from "@tanstack/react-query"
import { corporationJournalQuery, corporationJournalQueryKey } from "../../React Query/Corporation/journal"

/**
 * Custom hook that fetches corporation journal entries for a specific character.
 * 
 * This hook provides corporation journal data fetching for EVE Online corporations:
 * - Fetches journal entries for the corporation accessible to the character
 * - Returns journal data with corporation ID for identification
 * - Handles pagination automatically through the underlying query
 * - Provides loading, error, and success states
 * - Uses React Query for caching and background updates
 * 
 * The fetching process:
 * 1. Uses React Query to fetch corporation journal entries
 * 2. Handles pagination and data combination automatically
 * 3. Returns structured data with corporation ID
 * 4. Provides loading and error states
 * 
 * @param {string} characterHash - Character hash identifier for the user
 * @returns {Object} Object containing corporation journal data and states
 * @returns {Object} returns.data - Object with journal data and corporation_id
 * @returns {Array<Object>} returns.data.data - Array of journal entry objects
 * @returns {number} returns.data.corporation_id - Corporation ID for the journal
 * @returns {boolean} returns.isLoading - Whether the query is still loading
 * @returns {boolean} returns.isError - Whether the query has an error
 * @returns {Error|null} returns.error - Error object if an error occurred
 * 
 * @example
 * function CorporationJournal() {
 *   const { data: journal, isLoading, isError } = useGetCorporationJournal(characterHash);
 * 
 *   if (isLoading) return <div>Loading journal...</div>;
 *   if (isError) return <div>Error loading journal</div>;
 *   return (
 *     <div>
 *       <div>Corporation ID: {journal.corporation_id}</div>
 *       <div>Journal Entries: {journal.data.length} entries</div>
 *     </div>
 *   );
 * }
 */
function useGetCorporationJournal(characterHash) {
    return useQuery(corporationJournalQuery(characterHash))
}


/**
 * Retrieves cached corporation journal data from React Query cache for a specific character.
 * 
 * This function provides access to cached corporation journal data without triggering new queries:
 * - Checks query state for the corporation journal query
 * - Extracts cached data from React Query cache
 * - Returns appropriate loading, error, or success states
 * - Handles cases where query state doesn't exist
 * 
 * The caching process:
 * 1. Gets query state for the corporation journal query
 * 2. Determines loading, error, or success state
 * 3. Extracts cached data from successful queries
 * 4. Returns structured data with appropriate states
 * 
 * @param {Object} queryClient - React Query client instance
 * @param {string} characterHash - Character hash identifier for the user
 * @returns {Object} Object containing cached corporation journal data
 * @returns {Object} returns.data - Object with cached journal data and corporation_id
 * @returns {boolean} returns.isLoading - Whether the query is still loading
 * @returns {boolean} returns.isError - Whether the query has an error
 * @returns {Error|null} returns.error - Error object if an error occurred
 * 
 * @example
 * const cachedJournal = getCachedCorporationJournal(queryClient, characterHash);
 * if (!cachedJournal.isLoading && !cachedJournal.isError) {
 *   console.log(`Cached journal: ${cachedJournal.data.data.length} entries for corp ${cachedJournal.data.corporation_id}`);
 * }
 */
function getCachedCorporationJournal(queryClient, characterHash) {
    const queryState = queryClient.getQueryState([corporationJournalQueryKey, characterHash])

    if (queryState?.status === "loading" || !queryState) {
        return { data: {}, isLoading: true, isError: false }
    }

    if (queryState?.error) {
        return { data: {}, isLoading: false, isError: queryState.error }
    }

    const cachedJournal = queryClient.getQueryData([corporationJournalQueryKey, characterHash])

    return { data: cachedJournal, isLoading: false, isError: false }
}


export { useGetCorporationJournal, getCachedCorporationJournal }
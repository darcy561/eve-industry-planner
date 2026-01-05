import { useQuery } from "@tanstack/react-query";
import { characterJournalQuery, characterJournalQueryKey } from "../React Query/Character/journal";

/**
 * Custom hook that fetches character journal entries for a specific character.
 * 
 * This hook provides character journal data fetching for EVE Online characters:
 * - Fetches journal entries for the specified character
 * - Returns journal data with character hash for identification
 * - Handles pagination automatically through the underlying query
 * - Provides loading, error, and success states
 * - Uses React Query for caching and background updates
 * 
 * The fetching process:
 * 1. Uses React Query to fetch character journal entries
 * 2. Handles pagination and data combination automatically
 * 3. Returns structured data with character hash
 * 4. Provides loading and error states
 * 
 * @param {Object} userObject - User object containing character information
 * @param {string} userObject.CharacterHash - Character hash identifier for the user
 * @returns {Object} Object containing character journal data and states
 * @returns {Object} returns.data - Object with journal data and characterHash
 * @returns {Array<Object>} returns.data.data - Array of journal entry objects
 * @returns {string} returns.data.characterHash - Character hash for the journal
 * @returns {boolean} returns.isLoading - Whether the query is still loading
 * @returns {boolean} returns.isError - Whether the query has an error
 * @returns {Error|null} returns.error - Error object if an error occurred
 * 
 * @example
 * function CharacterJournal() {
 *   const { data: journal, isLoading, isError } = useGetCharacterJournal(userObject);
 * 
 *   if (isLoading) return <div>Loading journal...</div>;
 *   if (isError) return <div>Error loading journal</div>;
 *   return (
 *     <div>
 *       <div>Character: {journal.characterHash}</div>
 *       <div>Journal Entries: {journal.data.length} entries</div>
 *     </div>
 *   );
 * }
 */
export function useGetCharacterJournal(userObject) {
    return useQuery(characterJournalQuery(userObject));
}

/**
 * Retrieves cached character journal data from React Query cache for a specific character.
 * 
 * This function provides access to cached character journal data without triggering new queries:
 * - Checks query state for the character journal query
 * - Extracts cached data from React Query cache
 * - Returns appropriate loading, error, or success states
 * - Handles cases where query state doesn't exist
 * 
 * The caching process:
 * 1. Gets query state for the character journal query
 * 2. Determines loading, error, or success state
 * 3. Extracts cached data from successful queries
 * 4. Returns structured data with appropriate states
 * 
 * @param {Object} queryClient - React Query client instance
 * @param {Object} userObject - User object containing character information
 * @param {string} userObject.CharacterHash - Character hash identifier for the user
 * @returns {Object} Object containing cached character journal data
 * @returns {Object} returns.data - Object with cached journal data and characterHash
 * @returns {boolean} returns.isLoading - Whether the query is still loading
 * @returns {boolean} returns.isError - Whether the query has an error
 * @returns {Error|null} returns.error - Error object if an error occurred
 * 
 * @example
 * const cachedJournal = getCachedCharacterJournal(queryClient, userObject);
 * if (!cachedJournal.isLoading && !cachedJournal.isError) {
 *   console.log(`Cached journal: ${cachedJournal.data.data.length} entries for ${cachedJournal.data.characterHash}`);
 * }
 */
export function getCachedCharacterJournal(queryClient, userObject) {
    const queryState = queryClient.getQueryState([characterJournalQueryKey, userObject.CharacterHash]);

    if (queryState?.status === "loading" || !queryState) {
        return { data: [], isLoading: true, isError: false };
    }

    if (queryState?.error) {
        return { data: [], isLoading: false, isError: queryState.error };
    }

    const cachedJournal = queryClient.getQueryData([
        characterJournalQueryKey,
        userObject.CharacterHash,
    ]);

    return { data: cachedJournal, isLoading: false, isError: false };
}
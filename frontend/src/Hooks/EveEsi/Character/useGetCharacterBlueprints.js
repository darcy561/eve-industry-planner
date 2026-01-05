import { useQuery } from "@tanstack/react-query";
import { characterBlueprintsQuery, characterBlueprintsQueryKey } from "../../React Query/Character/blueprints"

/**
 * Custom hook that fetches character blueprints for a specific character.
 * 
 * This hook provides character blueprint data fetching for EVE Online characters:
 * - Fetches all blueprints for the specified character
 * - Returns blueprint data with character hash for identification
 * - Handles pagination automatically through the underlying query
 * - Provides loading, error, and success states
 * - Uses React Query for caching and background updates
 * 
 * The fetching process:
 * 1. Uses React Query to fetch character blueprints
 * 2. Handles pagination and data combination automatically
 * 3. Returns structured data with character hash
 * 4. Provides loading and error states
 * 
 * @param {string} characterHash - Character hash identifier for the user
 * @returns {Object} Object containing character blueprints data and states
 * @returns {Object} returns.data - Object with character blueprints data and characterHash
 * @returns {Array<Object>} returns.data.data - Array of character blueprint objects
 * @returns {string} returns.data.characterHash - Character hash for the blueprints
 * @returns {boolean} returns.isLoading - Whether the query is still loading
 * @returns {boolean} returns.isError - Whether the query has an error
 * @returns {Error|null} returns.error - Error object if an error occurred
 * 
 * @example
 * function CharacterBlueprints() {
 *   const { data: blueprints, isLoading, isError } = useGetCharacterBlueprints(characterHash);
 * 
 *   if (isLoading) return <div>Loading blueprints...</div>;
 *   if (isError) return <div>Error loading blueprints</div>;
 *   return (
 *     <div>
 *       <div>Character: {blueprints.characterHash}</div>
 *       <div>Blueprints: {blueprints.data.length} items</div>
 *     </div>
 *   );
 * }
 */
export function useGetCharacterBlueprints(characterHash) {
    return useQuery(characterBlueprintsQuery(characterHash));
}

/**
 * Retrieves cached character blueprints data from React Query cache for a specific character.
 * 
 * This function provides access to cached character blueprints data without triggering new queries:
 * - Checks query state for the character blueprints query
 * - Extracts cached data from React Query cache
 * - Returns appropriate loading, error, or success states
 * - Handles cases where query state doesn't exist
 * 
 * The caching process:
 * 1. Gets query state for the character blueprints query
 * 2. Determines loading, error, or success state
 * 3. Extracts cached data from successful queries
 * 4. Returns structured data with appropriate states
 * 
 * @param {Object} queryClient - React Query client instance
 * @param {string} characterHash - Character hash identifier for the user
 * @returns {Object} Object containing cached character blueprints data
 * @returns {Object} returns.data - Object with cached character blueprints data and characterHash
 * @returns {boolean} returns.isLoading - Whether the query is still loading
 * @returns {boolean} returns.isError - Whether the query has an error
 * @returns {Error|null} returns.error - Error object if an error occurred
 * 
 * @example
 * const cachedBlueprints = getCachedCharacterBlueprints(queryClient, characterHash);
 * if (!cachedBlueprints.isLoading && !cachedBlueprints.isError) {
 *   console.log(`Cached blueprints: ${cachedBlueprints.data.data.length} items for ${cachedBlueprints.data.characterHash}`);
 * }
 */
export function getCachedCharacterBlueprints(queryClient, characterHash) {
    const queryState = queryClient.getQueryState([characterBlueprintsQueryKey, characterHash]);

    if (queryState?.status === "loading" || !queryState) {
        return { data: [], isLoading: true, isError: false };
    }

    if (queryState?.error) {
        return { data: [], isLoading: false, isError: queryState.error };
    }

    const cachedBlueprints = queryClient.getQueryData([
        characterBlueprintsQueryKey,
        characterHash,
    ]);

    return { data: cachedBlueprints, isLoading: false, isError: false };
}   
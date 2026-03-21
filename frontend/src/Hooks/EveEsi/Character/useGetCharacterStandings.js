import { useQuery } from "@tanstack/react-query";
import { characterStandingsQuery, characterStandingsQueryKey } from "../../React Query/Character/standings";
import { isQueryStateLoading } from "../queryLoadingState";

/**
 * Custom hook that fetches character standings for a specific character.
 * 
 * This hook provides character standings data fetching for EVE Online characters:
 * - Fetches all standings for the specified character
 * - Returns standings data with faction and corporation relationships
 * - Provides loading, error, and success states
 * - Uses React Query for caching and background updates
 * - Handles character standings data efficiently
 * 
 * The fetching process:
 * 1. Uses React Query to fetch character standings
 * 2. Returns standings data in array format
 * 3. Provides structured loading and error states
 * 
 * @param {string} characterHash - Character hash identifier for the user
 * @returns {Object} Object containing character standings data and states
 * @returns {Array<Object>} returns.data - Array of standings objects with faction/corporation relationships
 * @returns {boolean} returns.isLoading - Whether the query is still loading
 * @returns {boolean} returns.isError - Whether the query has an error
 * @returns {Error|null} returns.error - Error object if an error occurred
 * 
 * @example
 * function CharacterStandings() {
 *   const { data: standings, isLoading, isError } = useGetCharacterStandings(characterHash);
 * 
 *   if (isLoading) return <div>Loading standings...</div>;
 *   if (isError) return <div>Error loading standings</div>;
 *   return <div>Standings: {standings.length} relationships</div>;
 * }
 */
export function useGetCharacterStandings(characterHash) {
  return useQuery(characterStandingsQuery(characterHash));
}

/**
 * Retrieves cached character standings data from React Query cache for a specific character.
 * 
 * This function provides access to cached character standings data without triggering new queries:
 * - Checks query state for the character standings query
 * - Extracts cached data from React Query cache
 * - Returns appropriate loading, error, or success states
 * - Handles cases where query state doesn't exist
 * 
 * The caching process:
 * 1. Gets query state for the character standings query
 * 2. Determines loading, error, or success state
 * 3. Extracts cached data from successful queries
 * 4. Returns structured data with appropriate states
 * 
 * @param {Object} queryClient - React Query client instance
 * @param {string} characterHash - Character hash identifier for the user
 * @returns {Object} Object containing cached character standings data
 * @returns {Array<Object>} returns.data - Array of cached standings objects
 * @returns {boolean} returns.isLoading - Whether the query is still loading
 * @returns {boolean} returns.isError - Whether the query has an error
 * @returns {Error|null} returns.error - Error object if an error occurred
 * 
 * @example
 * const cachedStandings = getCachedCharacterStandings(queryClient, characterHash);
 * if (!cachedStandings.isLoading && !cachedStandings.isError) {
 *   console.log(`Cached standings: ${cachedStandings.data.length} relationships`);
 * }
 */
export function getCachedCharacterStandings(queryClient, characterHash) {
  const queryState = queryClient.getQueryState([characterStandingsQueryKey, characterHash]);

  if (isQueryStateLoading(queryState)) {
    return { data: [], isLoading: true, isError: false };
  }

  if (queryState?.error) {
    return { data: [], isLoading: false, isError: queryState.error };
  }

  const cachedStandings = queryClient.getQueryData([
    characterStandingsQueryKey,
    characterHash,
  ]);

  return { data: cachedStandings, isLoading: false, isError: false };
}

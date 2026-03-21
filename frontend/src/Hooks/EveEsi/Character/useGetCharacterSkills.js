import { useQuery } from "@tanstack/react-query";
import { characterSkillsQuery, characterSkillsQueryKey } from "../../React Query/Character/skills"
import { isQueryStateLoading } from "../queryLoadingState";

/**
 * Custom hook that fetches character skills for a specific character.
 * 
 * This hook provides character skills data fetching for EVE Online characters:
 * - Fetches all skills for the specified character
 * - Returns skills data as an object with skill IDs as keys
 * - Provides loading, error, and success states
 * - Uses React Query for caching and background updates
 * - Handles character skill data efficiently
 * 
 * The fetching process:
 * 1. Uses React Query to fetch character skills
 * 2. Returns skills data in object format for easy access
 * 3. Provides structured loading and error states
 * 
 * @param {string} characterHash - Character hash identifier for the user
 * @returns {Object} Object containing character skills data and states
 * @returns {Object} returns.data - Object with skill IDs as keys and skill data as values
 * @returns {boolean} returns.isLoading - Whether the query is still loading
 * @returns {boolean} returns.isError - Whether the query has an error
 * @returns {Error|null} returns.error - Error object if an error occurred
 * 
 * @example
 * function CharacterSkills() {
 *   const { data: skills, isLoading, isError } = useGetCharacterSkills(characterHash);
 * 
 *   if (isLoading) return <div>Loading skills...</div>;
 *   if (isError) return <div>Error loading skills</div>;
 *   return <div>Skills: {Object.keys(skills).length} skills loaded</div>;
 * }
 */
export function useGetCharacterSkills(characterHash) {
  return useQuery(characterSkillsQuery(characterHash));
}

/**
 * Retrieves cached character skills data from React Query cache for a specific character.
 * 
 * This function provides access to cached character skills data without triggering new queries:
 * - Checks query state for the character skills query
 * - Extracts cached data from React Query cache
 * - Returns appropriate loading, error, or success states
 * - Handles cases where query state doesn't exist
 * 
 * The caching process:
 * 1. Gets query state for the character skills query
 * 2. Determines loading, error, or success state
 * 3. Extracts cached data from successful queries
 * 4. Returns structured data with appropriate states
 * 
 * @param {Object} queryClient - React Query client instance
 * @param {string} characterHash - Character hash identifier for the user
 * @returns {Object} Object containing cached character skills data
 * @returns {Object} returns.data - Object with cached character skills (skill IDs as keys)
 * @returns {boolean} returns.isLoading - Whether the query is still loading
 * @returns {boolean} returns.isError - Whether the query has an error
 * @returns {Error|null} returns.error - Error object if an error occurred
 * 
 * @example
 * const cachedSkills = getCachedCharacterSkills(queryClient, characterHash);
 * if (!cachedSkills.isLoading && !cachedSkills.isError) {
 *   console.log(`Cached skills: ${Object.keys(cachedSkills.data).length} skills`);
 * }
 */
export function getCachedCharacterSkills(queryClient, characterHash) {
  const queryState = queryClient.getQueryState([characterSkillsQueryKey, characterHash]);

  if (isQueryStateLoading(queryState)) {
    return { data: {}, isLoading: true, isError: false };
  }

  if (queryState?.error) {
    return { data: {}, isLoading: false, isError: queryState.error };
  }

  const cachedSkills = queryClient.getQueryData([characterSkillsQueryKey, characterHash]);

  return { data: cachedSkills, isLoading: false, isError: false };
}

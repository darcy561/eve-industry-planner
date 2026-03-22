import { useQuery } from "@tanstack/react-query";
import { characterIndustryJobsQuery, characterIndustryJobsQueryKey } from "../../React Query/Character/industryJobs";
import { isQueryStateLoading } from "../queryLoadingState";

/**
 * Custom hook that fetches character industry jobs for a specific character.
 * 
 * This hook provides character industry jobs data fetching for EVE Online characters:
 * - Fetches active industry jobs for the specified character
 * - Returns industry jobs data with character hash for identification
 * - Handles pagination automatically through the underlying query
 * - Provides loading, error, and success states
 * - Uses React Query for caching and background updates
 * 
 * The fetching process:
 * 1. Uses React Query to fetch character industry jobs
 * 2. Handles pagination and data combination automatically
 * 3. Returns structured data with character hash
 * 4. Provides loading and error states
 * 
 * @param {string} characterHash - Character hash identifier for the user
 * @returns {Object} Object containing character industry jobs data and states
 * @returns {Object} returns.data - Object with industry jobs data and characterHash
 * @returns {Array<Object>} returns.data.data - Array of industry job objects
 * @returns {string} returns.data.characterHash - Character hash for the jobs
 * @returns {boolean} returns.isLoading - Whether the query is still loading
 * @returns {boolean} returns.isError - Whether the query has an error
 * @returns {Error|null} returns.error - Error object if an error occurred
 * 
 * @example
 * function CharacterIndustryJobs() {
 *   const { data: industryJobs, isLoading, isError } = useGetCharacterIndustryJobs(characterHash);
 * 
 *   if (isLoading) return <div>Loading industry jobs...</div>;
 *   if (isError) return <div>Error loading industry jobs</div>;
 *   return (
 *     <div>
 *       <div>Character: {industryJobs.characterHash}</div>
 *       <div>Industry Jobs: {industryJobs.data.length} active jobs</div>
 *     </div>
 *   );
 * }
 */
export function useGetCharacterIndustryJobs(characterHash) {
    return useQuery(characterIndustryJobsQuery(characterHash));
}

/**
 * Retrieves cached character industry jobs data from React Query cache for a specific character.
 * 
 * This function provides access to cached character industry jobs data without triggering new queries:
 * - Checks query state for the character industry jobs query
 * - Extracts cached data from React Query cache
 * - Returns appropriate loading, error, or success states
 * - Handles cases where query state doesn't exist
 * 
 * The caching process:
 * 1. Gets query state for the character industry jobs query
 * 2. Determines loading, error, or success state
 * 3. Extracts cached data from successful queries
 * 4. Returns structured data with appropriate states
 * 
 * @param {Object} queryClient - React Query client instance
 * @param {string} characterHash - Character hash identifier for the user
 * @returns {Object} Object containing cached character industry jobs data
 * @returns {Array<Object>} returns.data - Array of cached industry job objects
 * @returns {boolean} returns.isLoading - Whether the query is still loading
 * @returns {boolean} returns.isError - Whether the query has an error
 * @returns {Error|null} returns.error - Error object if an error occurred
 * 
 * @example
 * const cachedIndustryJobs = getCachedCharacterIndustryJobs(queryClient, characterHash);
 * if (!cachedIndustryJobs.isLoading && !cachedIndustryJobs.isError) {
 *   console.log(`Cached industry jobs: ${cachedIndustryJobs.data.length} active jobs`);
 * }
 */
export function getCachedCharacterIndustryJobs(queryClient, characterHash) {
    const queryState = queryClient.getQueryState([characterIndustryJobsQueryKey, characterHash]);

    if (isQueryStateLoading(queryState)) {
        return { data: [], isLoading: true, isError: false };
    }

    if (queryState?.error) {
        return { data: [], isLoading: false, isError: queryState.error };
    }

    const cachedIndustryJobs = queryClient.getQueryData([
        characterIndustryJobsQueryKey,
        characterHash,
    ]);

    return { data: cachedIndustryJobs?.data || [], isLoading: false, isError: false };
}       
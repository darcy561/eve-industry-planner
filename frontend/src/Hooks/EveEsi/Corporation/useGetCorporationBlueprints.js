import { useQuery } from "@tanstack/react-query";
import {
  corporationBlueprintsQuery,
  corporationBlueprintsQueryKey,
} from "../../React Query/Corporation/blueprints";
import { isQueryStateLoading } from "../queryLoadingState";

/**
 * Custom hook that fetches corporation blueprints for a specific character.
 * 
 * This hook provides corporation blueprint data fetching for EVE Online corporations:
 * - Fetches all corporation blueprints accessible to the character
 * - Returns blueprint data with corporation ID for identification
 * - Handles pagination automatically through the underlying query
 * - Provides loading, error, and success states
 * - Uses React Query for caching and background updates
 * 
 * The fetching process:
 * 1. Uses React Query to fetch corporation blueprints
 * 2. Handles pagination and data combination automatically
 * 3. Returns structured data with corporation ID
 * 4. Provides loading and error states
 * 
 * @param {string} characterHash - Character hash identifier for the user
 * @returns {Object} Object containing corporation blueprints data and states
 * @returns {Object} returns.data - Object with corporation blueprints data and corporation_id
 * @returns {Array<Object>} returns.data.data - Array of corporation blueprint objects
 * @returns {number} returns.data.corporation_id - Corporation ID for the blueprints
 * @returns {boolean} returns.isLoading - Whether the query is still loading
 * @returns {boolean} returns.isError - Whether the query has an error
 * @returns {Error|null} returns.error - Error object if an error occurred
 * 
 * @example
 * function CorporationBlueprints() {
 *   const { data: blueprints, isLoading, isError } = useGetCorporationBlueprints(characterHash);
 * 
 *   if (isLoading) return <div>Loading corporation blueprints...</div>;
 *   if (isError) return <div>Error loading blueprints</div>;
 *   return (
 *     <div>
 *       <div>Corporation ID: {blueprints.corporation_id}</div>
 *       <div>Blueprints: {blueprints.data.length} items</div>
 *     </div>
 *   );
 * }
 */
export function useGetCorporationBlueprints(characterHash) {
  return useQuery(corporationBlueprintsQuery(characterHash));
}

/**
 * Retrieves cached corporation blueprints data from React Query cache for a specific character.
 * 
 * This function provides access to cached corporation blueprints data without triggering new queries:
 * - Checks query state for the corporation blueprints query
 * - Extracts cached data from React Query cache
 * - Returns appropriate loading, error, or success states
 * - Handles cases where query state doesn't exist
 * 
 * The caching process:
 * 1. Gets query state for the corporation blueprints query
 * 2. Determines loading, error, or success state
 * 3. Extracts cached data from successful queries
 * 4. Returns structured data with appropriate states
 * 
 * @param {Object} queryClient - React Query client instance
 * @param {string} characterHash - Character hash identifier for the user
 * @returns {Object} Object containing cached corporation blueprints data
 * @returns {Object} returns.data - Object with cached corporation blueprints data and corporation_id
 * @returns {boolean} returns.isLoading - Whether the query is still loading
 * @returns {boolean} returns.isError - Whether the query has an error
 * @returns {Error|null} returns.error - Error object if an error occurred
 * 
 * @example
 * const cachedBlueprints = getCachedCorporationBlueprints(queryClient, characterHash);
 * if (!cachedBlueprints.isLoading && !cachedBlueprints.isError) {
 *   console.log(`Cached blueprints: ${cachedBlueprints.data.data.length} items for corp ${cachedBlueprints.data.corporation_id}`);
 * }
 */
export function getCachedCorporationBlueprints(queryClient, characterHash) {
  const queryState = queryClient.getQueryState([
    corporationBlueprintsQueryKey,
    characterHash,
  ]);

  if (isQueryStateLoading(queryState)) {
    return { data: {}, isLoading: true, isError: false };
  }

  if (queryState?.error) {
    return { data: {}, isLoading: false, isError: queryState.error };
  }

  const cachedBlueprints = queryClient.getQueryData([
    corporationBlueprintsQueryKey,
    characterHash,
  ]);

  return { data: cachedBlueprints, isLoading: false, isError: false };
}

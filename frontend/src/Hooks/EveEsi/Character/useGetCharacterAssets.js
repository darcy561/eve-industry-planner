import { useQuery } from "@tanstack/react-query";
import {
  characterAssetsQuery,
  characterAssetsQueryKey,
} from "../../React Query/Character/assets";

/**
 * Custom hook that fetches character assets for a specific character.
 * 
 * This hook provides character asset data fetching for a single EVE Online character:
 * - Fetches all assets for the specified character
 * - Handles pagination automatically through the underlying query
 * - Provides loading, error, and success states
 * - Uses React Query for caching and background updates
 * - Validates character hash before making requests
 * 
 * The fetching process:
 * 1. Validates the character hash parameter
 * 2. Uses React Query to fetch character assets
 * 3. Handles pagination and data combination automatically
 * 4. Returns structured data with loading states
 * 
 * @param {string} characterHash - Character hash identifier for the user
 * @returns {Object} Object containing character assets data and states
 * @returns {Array<Object>} returns.data - Array of character asset objects
 * @returns {boolean} returns.isLoading - Whether the query is still loading
 * @returns {boolean} returns.isError - Whether the query has an error
 * @returns {Error|null} returns.error - Error object if an error occurred
 * 
 * @example
 * function CharacterAssets() {
 *   const { data: assets, isLoading, isError } = useGetCharacterAssets(characterHash);
 * 
 *   if (isLoading) return <div>Loading assets...</div>;
 *   if (isError) return <div>Error loading assets</div>;
 *   return <div>Assets: {assets.length} items</div>;
 * }
 */
export function useGetCharacterAssets(characterHash) {
  if (!characterHash) {
    return { data: [], isLoading: false, isError: true };
  }
  return useQuery(characterAssetsQuery(characterHash));
}

/**
 * Retrieves cached character assets data from React Query cache for a specific character.
 * 
 * This function provides access to cached character assets data without triggering new queries:
 * - Checks query state for the character asset query
 * - Extracts cached data from React Query cache
 * - Returns appropriate loading, error, or success states
 * - Handles cases where query state doesn't exist
 * 
 * The caching process:
 * 1. Gets query state for the character asset query
 * 2. Determines loading, error, or success state
 * 3. Extracts cached data from successful queries
 * 4. Returns structured data with appropriate states
 * 
 * @param {Object} queryClient - React Query client instance
 * @param {string} characterHash - Character hash identifier for the user
 * @returns {Object} Object containing cached character assets data
 * @returns {Array<Object>} returns.data - Array of cached character asset objects
 * @returns {boolean} returns.isLoading - Whether the query is still loading
 * @returns {boolean} returns.isError - Whether the query has an error
 * @returns {Error|null} returns.error - Error object if an error occurred
 * 
 * @example
 * const cachedAssets = getCachedCharacterAssets(queryClient, characterHash);
 * if (!cachedAssets.isLoading && !cachedAssets.isError) {
 *   console.log(`Cached assets: ${cachedAssets.data.length} items`);
 * }
 */
export function getCachedCharacterAssets(queryClient, characterHash) {
  const queryState = queryClient.getQueryState([
    characterAssetsQueryKey,
    characterHash,
  ]);

  if (queryState?.status === "loading" || !queryState) {
    return { data: [], isLoading: true, isError: false };
  }

  if (queryState?.error) {
    return { data: [], isLoading: false, isError: queryState.error };
  }

  const cachedAssets = queryClient.getQueryData([
    characterAssetsQueryKey,
    characterHash,
  ]);

  return { data: cachedAssets, isLoading: false, isError: false };
}

import { useCallback } from "react";
import { useQueries } from "@tanstack/react-query";
import useUsersStore from "../../Zustand/usersStore";
import {
  corporationAssetsQuery,
  corporationAssetsQueryKey,
} from "../React Query/Corporation/assets";
import { isQueryObserverResultLoading, isQueryStateLoading } from "./queryLoadingState";

/**
 * Finds the first error in query states.
 * 
 * @param {Array<Object>} queryStates - Array of query state objects
 * @returns {Error|null} First error found, or null if none
 * 
 * @private
 */
function findFirstError(queryStates) {
  return queryStates.find(({ isError }) => isError)?.error;
}

/**
 * Creates a loading state object for corporation assets queries.
 * 
 * @returns {Object} Loading state object
 * 
 * @private
 */
function createLoadingObject() {
  return {
    isLoading: true,
    isError: false,
    error: null,
    data: null,
  };
}

/**
 * Creates an error state object for corporation assets queries.
 * 
 * @param {Error} error - Error object
 * @returns {Object} Error state object
 * 
 * @private
 */
function createErrorObject(error) {
  return {
    isLoading: false,
    isError: true,
    error: error,
    data: null,
  };
}

/**
 * Creates a success state object for corporation assets queries.
 * 
 * @param {Array<Object>} data - Array of corporation asset objects
 * @returns {Object} Success state object
 * 
 * @private
 */
function createSuccessObject(data) {
  return {
    isLoading: false,
    isError: false,
    error: null,
    data: data,
  };
}

/**
 * Removes duplicate corporation asset items based on item_id.
 * Filters out undefined, null, or non-object items and deduplicates by item_id.
 * 
 * @param {Array<Object>} data - Array of corporation asset objects
 * @returns {Array<Object>} Array of unique corporation asset objects
 * 
 * @private
 */
function findCorporationById(corporations, corporation_id) {
  return corporations?.find(
    (c) => Number(c.corporation_id) === Number(corporation_id)
  );
}

function removeDuplicateItems(data) {
  const uniqueItems = new Map();
  data.forEach((item) => {
    // Skip undefined or null items
    if (!item || typeof item !== 'object') {
      return;
    }
    const key = item.item_id;
    if (key !== undefined && !uniqueItems.has(key)) {
      uniqueItems.set(key, item);
    }
  });
  return Array.from(uniqueItems.values());
}

/**
 * Retrieves cached corporation assets data from React Query cache for a specific corporation.
 * 
 * This function provides access to cached corporation assets data without triggering new queries:
 * - Fetches assets for all corporation members
 * - Checks loading states for all member asset queries
 * - Extracts cached data from React Query cache
 * - Removes duplicate items based on item_id
 * - Returns appropriate loading, error, or success states
 * 
 * The caching process:
 * 1. Gets corporation members from corporation objects store
 * 2. Checks query states for all member asset queries
 * 3. Determines overall loading and error states
 * 4. Extracts cached data from successful queries
 * 5. Combines and deduplicates all corporation assets
 * 
 * @param {Object} queryClient - React Query client instance
 * @param {number} corporation_id - Corporation ID to get assets for
 * @returns {Object} Object containing cached corporation assets data
 * @returns {Array<Object>} returns.data - Array of unique corporation asset objects
 * @returns {boolean} returns.isLoading - Whether any queries are still loading
 * @returns {boolean} returns.isError - Whether any queries have errors
 * @returns {Error|null} returns.error - First error encountered, if any
 * 
 * @example
 * const cachedAssets = getCachedSingleCorporationAssets(queryClient, corporationId);
 * if (!cachedAssets.isLoading && !cachedAssets.isError) {
 *   console.log(`Found ${cachedAssets.data.length} corporation assets`);
 * }
 */
export function getCachedSingleCorporationAssets(queryClient, corporation_id) {
  const corporations = useUsersStore.getState().account.corporations;
  const corporation = findCorporationById(corporations, corporation_id);
  if (!corporation?.members?.length) {
    return createSuccessObject([]);
  }

  const queryStates = corporation.members.map(
    (characterHash) => {
      const queryKey = [corporationAssetsQueryKey, characterHash];
      return {
        CharacterHash: characterHash,
        queryState: queryClient.getQueryState(queryKey),
        cachedData: queryClient.getQueryData(queryKey),
      };
    }
  );

  const isLoading = queryStates.some(({ queryState }) =>
    isQueryStateLoading(queryState)
  );

  const error = queryStates.some(({ queryState }) => queryState?.error);

  if (isLoading) {
    return createLoadingObject();
  }

  if (error) {
    return createErrorObject(error);
  }

  const data = queryStates.map(({ cachedData }) => cachedData).flat().filter(Boolean);
  return createSuccessObject(removeDuplicateItems(data));
}

/**
 * Custom hook that fetches corporation assets for a specific corporation.
 * 
 * This hook provides corporation asset data fetching for EVE Online corporations:
 * - Fetches assets for all corporation members
 * - Combines assets from all members into a single dataset
 * - Removes duplicate items based on item_id
 * - Provides loading, error, and success states
 * - Uses React Query's useQueries for parallel data fetching
 * 
 * The fetching process:
 * 1. Gets corporation members from corporation objects store
 * 2. Creates queries for all member asset data
 * 3. Fetches data in parallel using React Query's useQueries
 * 4. Combines results using a custom combine function
 * 5. Deduplicates assets based on item_id
 * 
 * @param {number} corporation_id - Corporation ID to fetch assets for
 * @returns {Object} Object containing corporation assets data and states
 * @returns {Array<Object>} returns.data - Array of unique corporation asset objects
 * @returns {boolean} returns.isLoading - Whether any queries are still loading
 * @returns {boolean} returns.isError - Whether any queries have errors
 * @returns {Error|null} returns.error - First error encountered, if any
 * 
 * @example
 * function CorporationAssetsManager() {
 *   const { data: assets, isLoading, isError, error } = useGetSingleCorporationAssets(corporationId);
 * 
 *   if (isLoading) return <div>Loading corporation assets...</div>;
 *   if (isError) return <div>Error: {error.message}</div>;
 *   return <div>Corporation Assets: {assets.length} items</div>;
 * }
 */
export function useGetSingleCorporationAssets(corporation_id, enabled = true) {
  const corporations = useUsersStore((state) => state.account.corporations);

  const combineFunction = useCallback(
    (results) => {
      const isLoading = results.some(isQueryObserverResultLoading);
      const error = findFirstError(results);

      if (isLoading) {
        return createLoadingObject();
      }

      if (error) {
        return createErrorObject(error);
      }
      const data = results.map(({ data }) => data).flat().filter(Boolean);
      return createSuccessObject(removeDuplicateItems(data));
    },
    [corporations]
  );

  // Handle case where corporation_id might be null or corporation doesn't exist
  const corporation = findCorporationById(corporations, corporation_id);
  const members = corporation?.members || [];

  const result = useQueries({
    queries: members.map((characterHash) => {
      const query = corporationAssetsQuery(characterHash);
      return {
        ...query,
        enabled: enabled && query.enabled && !!corporation_id,
      };
    }),
    combine: combineFunction,
  });

  return result;
}

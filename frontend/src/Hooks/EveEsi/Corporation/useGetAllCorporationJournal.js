import { useQueries } from "@tanstack/react-query";
import useUsersStore from "../../../Zustand/usersStore";
import { useCallback } from "react";
import {
  corporationJournalQuery,
  corporationJournalQueryKey,
} from "../../React Query/Corporation/journal";
import {
  isQueryObserverResultLoading,
  isQueryStateLoading,
} from "../queryLoadingState";

/**
 * Utility function to extract journal entries from query results.
 * Handles the data structure returned by corporation journal queries.
 * 
 * @param {Array<Object>} results - Array of query result objects
 * @returns {Array<Object>} Flattened array of journal entry objects
 * 
 * @private
 */
function extractJournalEntriesFromResults(results) {
  return results.flatMap((result) => {
    // Guard against undefined/null results
    if (!result || !result.data) {
      return [];
    }
    
    const pages = result.data?.pages || [];
    return pages.flatMap((page) => {
      // Guard against undefined/null pages
      if (!page || !page.data) {
        return [];
      }
      return page.data;
    });
  });
}

/**
 * Utility function to check loading state from query results.
 * 
 * @param {Array<Object>} results - Array of query result objects
 * @returns {boolean} True if any query is loading
 * 
 * @private
 */
function checkLoadingState(results) {
  return results.some(isQueryObserverResultLoading);
}

/**
 * Utility function to find first error from query results.
 * 
 * @param {Array<Object>} results - Array of query result objects
 * @returns {Error|null} First error found, or null if none
 * 
 * @private
 */
function findFirstError(results) {
  return results.find((result) => result.error)?.error;
}

/**
 * Utility function to create error object for corporation journal queries.
 * 
 * @param {Error} error - Error object
 * @returns {Object} Error state object
 * 
 * @private
 */
function createErrorObject(error) {
  return {
    data: {},
    isLoading: false,
    isError: error !== null,
    error,
  };
}

/**
 * Utility function to create loading object for corporation journal queries.
 * 
 * @returns {Object} Loading state object
 * 
 * @private
 */
function createLoadingObject() {
  return {
    data: {},
    isLoading: true,
    isError: false,
    error: null,
  };
}

/**
 * Utility function to create success object for corporation journal queries.
 * 
 * @param {Object} data - Object with corporation IDs as keys and journal entry arrays as values
 * @returns {Object} Success state object
 * 
 * @private
 */
function createSuccessObject(data) {
  return {
    data,
    isLoading: false,
    isError: false,
    error: null,
  };
}

/**
 * Utility function to group journal entries by corporation.
 * 
 * @param {Array<Object>} entries - Array of journal entry objects
 * @returns {Object} Object with corporation IDs as keys and journal entry arrays as values
 * 
 * @private
 */
function groupJournalEntriesByCorporation(entries) {
  return entries.reduce((acc, entry) => {
    // Guard against undefined/null entries or missing corporation_id
    if (!entry || entry.corporation_id === undefined) {
      return acc;
    }
    
    const corpId = entry.corporation_id;
    if (!acc[corpId]) {
      acc[corpId] = [];
    }
    acc[corpId].push(entry);
    return acc;
  }, {});
}

/**
 * Utility function to remove duplicate journal entries.
 * 
 * @param {Array<Object>} entries - Array of journal entry objects
 * @returns {Array<Object>} Array of unique journal entry objects
 * 
 * @private
 */
function removeDuplicateJournalEntries(entries) {
  const uniqueJournalEntries = new Map();

  entries.forEach((entry) => {
    // Guard against undefined/null entries or missing required properties
    if (!entry || entry.corporation_id === undefined || entry.id === undefined) {
      return;
    }

    const key = `${entry.corporation_id}-${entry.id}`;
    if (!uniqueJournalEntries.has(key)) {
      uniqueJournalEntries.set(key, entry);
    }
  });

  return Array.from(uniqueJournalEntries.values());
}

/**
 * Retrieves cached corporation journal data from React Query cache for all users.
 * 
 * This function provides access to cached corporation journal data without triggering new queries:
 * - Fetches journal entries for all user corporations
 * - Checks loading states for all corporation journal queries
 * - Extracts cached data from React Query cache
 * - Groups entries by corporation ID with deduplication
 * - Returns appropriate loading, error, or success states
 * 
 * The caching process:
 * 1. Gets all user character hashes from the store
 * 2. Checks query states for all corporation journal queries
 * 3. Determines overall loading and error states
 * 4. Extracts cached data from successful queries
 * 5. Groups entries by corporation ID with deduplication
 * 
 * @param {Object} queryClient - React Query client instance
 * @returns {Object} Object containing cached corporation journal data
 * @returns {Object} returns.data - Object with corporation IDs as keys and journal entry arrays as values
 * @returns {boolean} returns.isLoading - Whether any queries are still loading
 * @returns {boolean} returns.isError - Whether any queries have errors
 * @returns {Error|null} returns.error - First error encountered, if any
 * 
 * @example
 * const cachedJournal = getAllCachedCorporationJournal(queryClient);
 * if (!cachedJournal.isLoading && !cachedJournal.isError) {
 *   Object.keys(cachedJournal.data).forEach(corpId => {
 *     console.log(`Corporation ${corpId}: ${cachedJournal.data[corpId].length} journal entries`);
 *   });
 * }
 */
export function getAllCachedCorporationJournal(queryClient) {
  const userArray = useUsersStore.getState().users.userArray;

  // Get query states for all users
  const queryStates = userArray.map((user) => {
    const queryKey = [corporationJournalQueryKey, user.CharacterHash];
    return {
      queryState: queryClient.getQueryState(queryKey),
      cachedData: queryClient.getQueryData(queryKey),
    };
  });
  
  // Check loading state
  const isLoading = queryStates.some(({ queryState }) =>
    isQueryStateLoading(queryState)
  );

  if (isLoading) {
    return createLoadingObject();
  }

  // Check for errors
  const error = queryStates.find(({ queryState }) => queryState?.error)?.queryState?.error;

  if (error) {
    return createErrorObject(error);
  }

  // Get cached data, filtering out undefined/null values
  const cachedJournalEntries = queryStates
    .map(({ cachedData }) => cachedData)
    .filter((data) => data != null) // Filter out null/undefined cached data
    .flat();

  const uniqueJournalEntries = removeDuplicateJournalEntries(cachedJournalEntries);
  const groupedJournalEntries = groupJournalEntriesByCorporation(uniqueJournalEntries);

  return createSuccessObject(groupedJournalEntries);
}

/**
 * Custom hook that fetches corporation journal entries for all user corporations.
 * 
 * This hook provides comprehensive corporation journal data fetching:
 * - Fetches journal entries for all user corporations in parallel
 * - Groups entries by corporation ID with deduplication by entry ID
 * - Handles pagination automatically through the underlying query
 * - Provides loading, error, and success states
 * - Uses React Query's useQueries for parallel data fetching
 * - Supports corporation financial transaction analysis and tracking
 * 
 * The fetching process:
 * 1. Gets all user character hashes from the store
 * 2. Creates queries for all corporation journal data
 * 3. Fetches data in parallel using React Query's useQueries
 * 4. Combines results using a custom combine function
 * 5. Groups entries by corporation ID with deduplication
 * 
 * @returns {Object} Object containing corporation journal data and states
 * @returns {Object} returns.data - Object with corporation IDs as keys and journal entry arrays as values
 * @returns {boolean} returns.isLoading - Whether any queries are still loading
 * @returns {boolean} returns.isError - Whether any queries have errors
 * @returns {Error|null} returns.error - First error encountered, if any
 * 
 * @example
 * function CorporationJournalManager() {
 *   const { data: journalByCorporation, isLoading, isError, error } = useGetAllCorporationJournal();
 * 
 *   if (isLoading) return <div>Loading corporation journal...</div>;
 *   if (isError) return <div>Error: {error.message}</div>;
 *   
 *   return (
 *     <div>
 *       {Object.keys(journalByCorporation).map(corpId => (
 *         <div key={corpId}>
 *           Corporation {corpId}: {journalByCorporation[corpId].length} journal entries
 *         </div>
 *       ))}
 *     </div>
 *   );
 * }
 */
export function useGetAllCorporationJournal() {
  const { userArray } = useUsersStore((state) => state.users);

  const combineFunction = useCallback((results) => {
    const isLoading = checkLoadingState(results);
    const error = findFirstError(results);
    const allJournalEntries = extractJournalEntriesFromResults(results);
    const uniqueJournalEntries = removeDuplicateJournalEntries(allJournalEntries);
    const groupedJournalEntries = groupJournalEntriesByCorporation(uniqueJournalEntries);

    if (isLoading) {
      return createLoadingObject();
    }

    if (error) {
      return createErrorObject(error);
    }

    return createSuccessObject(groupedJournalEntries);
  }, []);

  const result = useQueries({
    queries: userArray.map(({ CharacterHash }) => corporationJournalQuery(CharacterHash)),
    combine: combineFunction,
  });

  return result;
}

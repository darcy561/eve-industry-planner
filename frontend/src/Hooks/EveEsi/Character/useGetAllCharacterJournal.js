import { useQueries } from "@tanstack/react-query";
import useUsersStore from "../../../Zustand/usersStore";
import { useCallback } from "react";
import { characterJournalQuery, characterJournalQueryKey } from "../../React Query/Character/journal";

/**
 * Utility function to check loading state from query results.
 * 
 * @param {Array<Object>} results - Array of query result objects
 * @returns {boolean} True if any query is loading
 * 
 * @private
 */
function checkLoadingState(results) {
  return results.some((result) => result.isLoading);
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
 * Utility function to create error object for character journal queries.
 * 
 * @param {Error} error - Error object
 * @returns {Object} Error state object
 * 
 * @private
 */
function createErrorObject(error) {
  return {
    data: [],
    isLoading: false,
    isError: error !== null,
    error,
  };
}

/**
 * Utility function to create loading object for character journal queries.
 * 
 * @returns {Object} Loading state object
 * 
 * @private
 */
function createLoadingObject() {
  return {
    data: [],
    isLoading: true,
    isError: false,
    error: null,
  };
}

/**
 * Utility function to create success object for character journal queries.
 * 
 * @param {Object} data - Object with character hashes as keys and journal arrays as values
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
 * Utility function to create journal entries object organized by character hash.
 * 
 * @param {Array<Object>} userArray - Array of user objects with CharacterHash
 * @param {Array<Object>} dataArray - Array of data objects (query results or cached data)
 * @param {boolean} isCachedData - Whether the data is from cache
 * @returns {Object} Object with character hashes as keys and journal arrays as values
 * 
 * @private
 */
function createJournalEntriesObject(userArray, dataArray, isCachedData = false) {
  const journalEntriesByCharacter = {};
  dataArray.forEach((item, index) => {
    const CharacterHash = userArray[index]?.CharacterHash;
    if (CharacterHash) {
      let journalData;
      if (isCachedData) {
        // For cached data, extract from query state object
        journalData = item.cachedData?.data || item.cachedData || [];
      } else {
        // For query results, extract from result object
        journalData = item.data || [];
      }
      journalEntriesByCharacter[CharacterHash] = journalData;
    }
  });
  return journalEntriesByCharacter;
}

/**
 * Retrieves cached character journal data from React Query cache for all users.
 * 
 * This function provides access to cached character journal data without triggering new queries:
 * - Fetches journal entries for all user characters
 * - Checks loading states for all character journal queries
 * - Extracts cached data from React Query cache
 * - Organizes data by character hash for easy access
 * - Returns appropriate loading, error, or success states
 * 
 * The caching process:
 * 1. Gets all user character hashes from the store
 * 2. Checks query states for all character journal queries
 * 3. Determines overall loading and error states
 * 4. Extracts cached data from successful queries
 * 5. Organizes data by character hash
 * 
 * @param {Object} queryClient - React Query client instance
 * @returns {Object} Object containing cached character journal data
 * @returns {Object} returns.data - Object with character hashes as keys and journal arrays as values
 * @returns {boolean} returns.isLoading - Whether any queries are still loading
 * @returns {boolean} returns.isError - Whether any queries have errors
 * @returns {Error|null} returns.error - First error encountered, if any
 * 
 * @example
 * const cachedJournal = getAllCachedCharacterJournal(queryClient);
 * if (!cachedJournal.isLoading && !cachedJournal.isError) {
 *   Object.keys(cachedJournal.data).forEach(characterHash => {
 *     console.log(`Character ${characterHash}: ${cachedJournal.data[characterHash].length} journal entries`);
 *   });
 * }
 */
export function getAllCachedCharacterJournal(queryClient) {
  const userArray = useUsersStore.getState().users.userArray;

  // Get query states for all characters
  const queryStates = userArray.map(({ CharacterHash }) => {
    const queryKey = [characterJournalQueryKey, CharacterHash];
    return {
      queryState: queryClient.getQueryState(queryKey),
      cachedData: queryClient.getQueryData(queryKey),
    };
  });

  // Check loading state
  const isLoading = queryStates.some(({ queryState }) =>
    queryState?.status === "loading" || !queryState
  );

  if (isLoading) {
    return createLoadingObject();
  }

  // Check for errors
  const error = queryStates.find(({ queryState }) => queryState?.error)?.queryState?.error;

  if (error) {
    return createErrorObject(error);
  }

  // Create object with character hash as key
  const journalEntriesByCharacter = createJournalEntriesObject(userArray, queryStates, true);

  return createSuccessObject(journalEntriesByCharacter);
}

/**
 * Custom hook that fetches character journal entries for all user characters.
 * 
 * This hook provides comprehensive character journal data fetching:
 * - Fetches journal entries for all user characters in parallel
 * - Organizes journal entries by character hash for easy access
 * - Handles pagination automatically through the underlying query
 * - Provides loading, error, and success states
 * - Uses React Query's useQueries for parallel data fetching
 * - Supports financial transaction analysis and tracking
 * 
 * The fetching process:
 * 1. Gets all user character hashes from the store
 * 2. Creates queries for all character journal data
 * 3. Fetches data in parallel using React Query's useQueries
 * 4. Combines results using a custom combine function
 * 5. Organizes data by character hash for structured access
 * 
 * @returns {Object} Object containing character journal data and states
 * @returns {Object} returns.data - Object with character hashes as keys and journal arrays as values
 * @returns {boolean} returns.isLoading - Whether any queries are still loading
 * @returns {boolean} returns.isError - Whether any queries have errors
 * @returns {Error|null} returns.error - First error encountered, if any
 * 
 * @example
 * function CharacterJournalManager() {
 *   const { data: journalByCharacter, isLoading, isError, error } = useGetAllCharacterJournal();
 * 
 *   if (isLoading) return <div>Loading character journal...</div>;
 *   if (isError) return <div>Error: {error.message}</div>;
 *   
 *   return (
 *     <div>
 *       {Object.keys(journalByCharacter).map(characterHash => (
 *         <div key={characterHash}>
 *           Character {characterHash}: {journalByCharacter[characterHash].length} journal entries
 *         </div>
 *       ))}
 *     </div>
 *   );
 * }
 */
export function useGetAllCharacterJournal() {
  const { userArray } = useUsersStore((state) => state.users);

  const combineFunction = useCallback((results) => {
    const isLoading = checkLoadingState(results);
    const error = findFirstError(results);
    
    if (isLoading) {
      return createLoadingObject();
    }

    if (error) {
      return createErrorObject(error);
    }

    // Create object with character hash as key
    const journalEntriesByCharacter = createJournalEntriesObject(userArray, results, false);

    return createSuccessObject(journalEntriesByCharacter);
  }, [userArray]);

  const result = useQueries({
    queries: userArray.map(({ CharacterHash }) => characterJournalQuery(CharacterHash)),
    combine: combineFunction,
  });

  return result;
} 
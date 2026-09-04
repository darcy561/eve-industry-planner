import { useQueries } from "@tanstack/react-query";
import useUsersStore from "../../../Zustand/usersStore";
import { useCallback } from "react";
import {
  characterTransactionsQuery,
  characterTransactionsQueryKey,
} from "../../React Query/Character/transactions";
import {
  isQueryObserverResultLoading,
  isQueryStateLoading,
} from "../queryLoadingState";

/**
 * Utility function to extract transactions from query results.
 * Handles pagination structure and flattens transaction data.
 *
 * @param {Array<Object>} results - Array of query result objects
 * @returns {Array<Object>} Flattened array of transaction objects
 * 
 * @private
 */
function extractTransactionsFromResults(results) {
  return results.flatMap((result) => {
    const pages = result.data?.pages?.[0]?.pages || [];
    return pages.flatMap((page) => page.data || []);
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
 * Utility function to create error object for character transactions queries.
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
 * Utility function to create loading object for character transactions queries.
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
 * Utility function to create success object for character transactions queries.
 *
 * @param {Object} data - Object with character hashes as keys and transaction arrays as values
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
 * Utility function to sort transactions by date (newest first).
 *
 * @param {Array<Object>} transactions - Array of transaction objects
 * @returns {Array<Object>} Sorted array of transaction objects
 * 
 * @private
 */
function sortTransactionsByDate(transactions) {
  return transactions.sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
}

/**
 * Utility function to create transactions object organised by character hash.
 *
 * @param {Array<Object>} characters - Array of user objects with CharacterHash
 * @param {Array<Object>} dataArray - Array of data objects (query results or cached data)
 * @param {boolean} isCachedData - Whether the data is from cache
 * @returns {Object} Object with character hashes as keys and transaction arrays as values
 * 
 * @private
 */
function createTransactionsByCharacterObject(
  characters,
  dataArray,
  isCachedData = false
) {
  const transactionsByCharacter = {};
  dataArray.forEach((item, index) => {
    const CharacterHash = characters[index]?.CharacterHash;
    if (CharacterHash) {
      let transactionData;
      if (isCachedData) {
        // For cached data, extract from query state object
        transactionData = item.cachedData || [];
      } else {
        // For query results, extract from result object
        transactionData = item.data || [];
      }
      transactionsByCharacter[CharacterHash] = transactionData;
    }
  });
  return transactionsByCharacter;
}

/**
 * Retrieves cached character transactions data from React Query cache for all users.
 *
 * The caching process:
 * 1. Gets all user character hashes from the store
 * 2. Checks query states for all character transaction queries
 * 3. Determines overall loading and error states
 * 4. Extracts cached data from successful queries
 * 5. Organises data by character hash
 *
 * @param {Object} queryClient - React Query client instance
 * @returns {Object} Object containing cached character transactions data
 * @returns {Object} returns.data - Object with character hashes as keys and transaction arrays as values
 * @returns {boolean} returns.isLoading - Whether any queries are still loading
 * @returns {boolean} returns.isError - Whether any queries have errors
 * @returns {Error|null} returns.error - First error encountered, if any
 */
export function getAllCachedCharacterTransactions(queryClient) {
  const characters = useUsersStore.getState().account.characters;

  // Get query states for all characters
  const queryStates = characters.map(({ CharacterHash }) => {
    const queryKey = [characterTransactionsQueryKey, CharacterHash];
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
  const error = queryStates.find(({ queryState }) => queryState?.error)
    ?.queryState?.error;

  if (error) {
    return createErrorObject(error);
  }

  // Create object with character hash as key
  const transactionsByCharacter = createTransactionsByCharacterObject(
    characters,
    queryStates,
    true
  );

  return createSuccessObject(transactionsByCharacter);
}

/**
 * Custom hook that fetches character transactions for all user characters.
 *
 * The fetching process:
 * 1. Gets all user character hashes from the store
 * 2. Creates queries for all character transaction data
 * 3. Fetches data in parallel using React Query's useQueries
 * 4. Combines results using a custom combine function
 * 5. Organises data by character hash for structured access
 *
 * @returns {Object} Object containing character transactions data and states
 * @returns {Object} returns.data - Object with character hashes as keys and transaction arrays as values
 * @returns {boolean} returns.isLoading - Whether any queries are still loading
 * @returns {boolean} returns.isError - Whether any queries have errors
 * @returns {Error|null} returns.error - First error encountered, if any
 */
export default function useGetAllCharacterTransactions() {
  const characters = useUsersStore((state) => state.account.characters);

  const combineFunction = useCallback(
    (results) => {
      const isLoading = checkLoadingState(results);
      const error = findFirstError(results);

      if (isLoading) {
        return createLoadingObject();
      }

      if (error) {
        return createErrorObject(error);
      }

      // Create object with character hash as key
      const transactionsByCharacter = createTransactionsByCharacterObject(
        characters,
        results,
        false
      );

      return createSuccessObject(transactionsByCharacter);
    },
    [characters]
  );

  const result = useQueries({
    queries: characters.map(({ CharacterHash }) =>
      characterTransactionsQuery(CharacterHash)
    ),
    combine: combineFunction,
  });

  return result;
}

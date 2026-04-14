import { useQueries } from "@tanstack/react-query";
import useUsersStore from "../../../Zustand/usersStore";
import { useCallback } from "react";
import { corporationTransactionsQuery, corporationTransactionsQueryKey } from "../../React Query/Corporation/transactions";
import {
  isQueryObserverResultLoading,
  isQueryStateLoading,
} from "../queryLoadingState";

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
 * Utility function to create error object for corporation transactions queries.
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
 * Utility function to create loading object for corporation transactions queries.
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
 * Utility function to create success object for corporation transactions queries.
 * 
 * @param {Object} data - Object with corporation IDs as keys and transaction arrays as values
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
 * Utility function to group transactions by corporation.
 * 
 * @param {Array<Object>} transactions - Array of transaction objects
 * @returns {Object} Object with corporation IDs as keys and transaction arrays as values
 * 
 * @private
 */
function groupTransactionsByCorporation(transactions) {
  return transactions.reduce((acc, transaction) => {
    const corpId = transaction.corporation_id;
    if (!acc[corpId]) {
      acc[corpId] = [];
    }
    acc[corpId].push(transaction);
    return acc;
  }, {});
}

/**
 * Utility function to remove duplicate transactions.
 * 
 * @param {Array<Object>} transactions - Array of transaction objects
 * @returns {Array<Object>} Array of unique transaction objects
 * 
 * @private
 */
function removeDuplicateTransactions(transactions) {
  const uniqueTransactions = new Map();

  transactions.forEach((transaction) => {
    const key = `${transaction.corporation_id}-${transaction.transaction_id}`;
    if (!uniqueTransactions.has(key)) {
      uniqueTransactions.set(key, transaction);
    }
  });
  
  return Array.from(uniqueTransactions.values());
}

/**
 * Utility function to create transactions object organized by corporation ID only.
 * 
 * @param {Array<Object>} characters - Array of user objects
 * @param {Array<Object>} dataArray - Array of data objects (query results or cached data)
 * @param {boolean} isCachedData - Whether the data is from cache
 * @returns {Object} Object with corporation IDs as keys and transaction arrays as values
 * 
 * @private
 */
function createTransactionsByCorporationObject(characters, dataArray, isCachedData = false) {
  // Collect all transactions from all characters
  let allTransactions = [];
  
  dataArray.forEach((item) => {
    let transactionData;
    if (isCachedData) {
      // For cached data, the cachedData is already the transaction array
      transactionData = item.cachedData || [];
    } else {
      // For query results, extract from result object
      transactionData = item.data || [];
    }
    
    // The data is already an array of transaction objects
    if (Array.isArray(transactionData)) {
      allTransactions = allTransactions.concat(transactionData);
    }
  });
  
  // Remove duplicate transactions by transaction_id across all characters
  const uniqueTransactions = removeDuplicateTransactions(allTransactions);
  
  // Group transactions by corporation ID
  const transactionsByCorp = groupTransactionsByCorporation(uniqueTransactions);
  
  return transactionsByCorp;
}

/**
 * Retrieves cached corporation transactions data from React Query cache for all users.
 * 
 * This function provides access to cached corporation transactions data without triggering new queries:
 * - Fetches transactions for all user corporations
 * - Checks loading states for all corporation transaction queries
 * - Extracts cached data from React Query cache
 * - Groups transactions by corporation ID with deduplication
 * - Returns appropriate loading, error, or success states
 * 
 * The caching process:
 * 1. Gets all user character hashes from the store
 * 2. Checks query states for all corporation transaction queries
 * 3. Determines overall loading and error states
 * 4. Extracts cached data from successful queries
 * 5. Groups transactions by corporation ID with deduplication
 * 
 * @param {Object} queryClient - React Query client instance
 * @returns {Object} Object containing cached corporation transactions data
 * @returns {Object} returns.data - Object with corporation IDs as keys and transaction arrays as values
 * @returns {boolean} returns.isLoading - Whether any queries are still loading
 * @returns {boolean} returns.isError - Whether any queries have errors
 * @returns {Error|null} returns.error - First error encountered, if any
 * 
 * @example
 * const cachedTransactions = getAllCachedCorporationTransactions(queryClient);
 * if (!cachedTransactions.isLoading && !cachedTransactions.isError) {
 *   Object.keys(cachedTransactions.data).forEach(corpId => {
 *     console.log(`Corporation ${corpId}: ${cachedTransactions.data[corpId].length} transactions`);
 *   });
 * }
 */
export function getAllCachedCorporationTransactions(queryClient) {
  const characters = useUsersStore.getState().account.characters;

  // Get query states for all users
  const queryStates = characters.map((user) => {
    const queryKey = [corporationTransactionsQueryKey, user.CharacterHash];
    
    const queryState = queryClient.getQueryState(queryKey);
    const cachedData = queryClient.getQueryData(queryKey);
    
    return {
      queryState,
      cachedData,
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

  // Create object with corporation ID as key
  const transactionsByCorporation = createTransactionsByCorporationObject(characters, queryStates, true);

  return createSuccessObject(transactionsByCorporation);
}

/**
 * Custom hook that fetches corporation transactions for all user corporations.
 * 
 * This hook provides comprehensive corporation transactions data fetching:
 * - Fetches transactions for all user corporations in parallel
 * - Groups transactions by corporation ID with deduplication by transaction_id
 * - Handles pagination automatically through the underlying query
 * - Provides loading, error, and success states
 * - Uses React Query's useQueries for parallel data fetching
 * - Supports corporation financial transaction analysis and tracking
 * 
 * The fetching process:
 * 1. Gets all user character hashes from the store
 * 2. Creates queries for all corporation transaction data
 * 3. Fetches data in parallel using React Query's useQueries
 * 4. Combines results using a custom combine function
 * 5. Groups transactions by corporation ID with deduplication
 * 
 * @returns {Object} Object containing corporation transactions data and states
 * @returns {Object} returns.data - Object with corporation IDs as keys and transaction arrays as values
 * @returns {boolean} returns.isLoading - Whether any queries are still loading
 * @returns {boolean} returns.isError - Whether any queries have errors
 * @returns {Error|null} returns.error - First error encountered, if any
 * 
 * @example
 * function CorporationTransactionsManager() {
 *   const { data: transactionsByCorporation, isLoading, isError, error } = useGetAllCorporationTransactions();
 * 
 *   if (isLoading) return <div>Loading transactions...</div>;
 *   if (isError) return <div>Error: {error.message}</div>;
 *   
 *   return (
 *     <div>
 *       {Object.keys(transactionsByCorporation).map(corpId => (
 *         <div key={corpId}>
 *           Corporation {corpId}: {transactionsByCorporation[corpId].length} transactions
 *         </div>
 *       ))}
 *     </div>
 *   );
 * }
 */
export function useGetAllCorporationTransactions() {
  const characters = useUsersStore.getState().account.characters;

  const combineFunction = useCallback((results) => {
    const isLoading = checkLoadingState(results);
    const error = findFirstError(results);
    
    if (isLoading) {
      return createLoadingObject();
    }

    if (error) {
      return createErrorObject(error);
    }

    // Create object with corporation ID as key
    const transactionsByCorporation = createTransactionsByCorporationObject(characters, results, false);

    return createSuccessObject(transactionsByCorporation);
  }, [characters]);

  const result = useQueries({
    queries: characters.map(({ CharacterHash }) => corporationTransactionsQuery(CharacterHash)),
    combine: combineFunction,
  });

  return result;
}

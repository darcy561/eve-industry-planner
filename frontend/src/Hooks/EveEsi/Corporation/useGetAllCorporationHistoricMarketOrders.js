import { useQueries } from "@tanstack/react-query";
import useUsersStore from "../../../Zustand/usersStore";
import { useCallback } from "react";
import { corporationHistoricMarketOrdersQuery, corporationHistoricMarketOrdersQueryKey } from "../../React Query/Corporation/historicMarketOrders";

/**
 * Utility function to extract and group market orders by corporation_id with deduplication.
 * 
 * @param {Array<Array<Object>>} dataSources - Array of data source arrays containing market orders
 * @returns {Object} Object with corporation IDs as keys and market order arrays as values
 * 
 * @private
 */
function extractAndGroupMarketOrdersByCorporation(dataSources) {
  const marketOrdersObject = {};
  const seenOrderIds = new Set(); // Track seen order IDs to avoid duplicates
  
  dataSources.forEach((dataSource, index) => {
    // Add defensive programming to handle non-array data
    if (!Array.isArray(dataSource)) {
      return;
    }
    
    const orders = dataSource;
    
    orders.forEach((order) => {
      const corpId = order.corporation_id;
      const orderId = order.order_id;
      
      // Skip if we've already seen this order ID (duplicate from another user)
      if (seenOrderIds.has(orderId)) {
        return;
      }
      
      seenOrderIds.add(orderId);
      
      if (!marketOrdersObject[corpId]) {
        marketOrdersObject[corpId] = [];
      }
      
      marketOrdersObject[corpId].push(order);
    });
  });
  
  return marketOrdersObject;
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
 * Utility function to create error object for corporation historic market orders queries.
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
 * Utility function to create loading object for corporation historic market orders queries.
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
 * Utility function to create success object for corporation historic market orders queries.
 * 
 * @param {Object} data - Object with corporation IDs as keys and market order arrays as values
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
 * Retrieves cached corporation historic market orders data from React Query cache for all users.
 * 
 * This function provides access to cached corporation historic market orders data without triggering new queries:
 * - Fetches historic market orders for all user corporations
 * - Checks loading states for all corporation historic market order queries
 * - Extracts cached data from React Query cache
 * - Groups orders by corporation ID with deduplication
 * - Returns appropriate loading, error, or success states
 * 
 * The caching process:
 * 1. Gets all user character hashes from the store
 * 2. Checks query states for all corporation historic market order queries
 * 3. Determines overall loading and error states
 * 4. Extracts cached data from successful queries
 * 5. Groups orders by corporation ID with deduplication
 * 
 * @param {Object} queryClient - React Query client instance
 * @returns {Object} Object containing cached corporation historic market orders data
 * @returns {Object} returns.data - Object with corporation IDs as keys and market order arrays as values
 * @returns {boolean} returns.isLoading - Whether any queries are still loading
 * @returns {boolean} returns.isError - Whether any queries have errors
 * @returns {Error|null} returns.error - First error encountered, if any
 * 
 * @example
 * const cachedHistoricOrders = getAllCachedCorporationHistoricMarketOrders(queryClient);
 * if (!cachedHistoricOrders.isLoading && !cachedHistoricOrders.isError) {
 *   Object.keys(cachedHistoricOrders.data).forEach(corpId => {
 *     console.log(`Corporation ${corpId}: ${cachedHistoricOrders.data[corpId].length} completed orders`);
 *   });
 * }
 */
export function getAllCachedCorporationHistoricMarketOrders(queryClient) {
  const userArray = useUsersStore.getState().users.userArray;

  // Get query states for all users
  const queryStates = userArray.map((user) => {
    const queryKey = [corporationHistoricMarketOrdersQueryKey, user.CharacterHash];
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

  // Extract cached data sources
  const dataSources = queryStates.map(({ cachedData }) => cachedData);
  const marketOrdersObject = extractAndGroupMarketOrdersByCorporation(dataSources);

  return createSuccessObject(marketOrdersObject);
}

/**
 * Custom hook that fetches corporation historic market orders for all user corporations.
 * 
 * This hook provides comprehensive corporation historic market orders data fetching:
 * - Fetches historic market orders for all user corporations in parallel
 * - Groups orders by corporation ID with deduplication by order_id
 * - Handles pagination automatically through the underlying query
 * - Provides loading, error, and success states
 * - Uses React Query's useQueries for parallel data fetching
 * - Supports completed market order analysis and tracking
 * 
 * The fetching process:
 * 1. Gets all user character hashes from the store
 * 2. Creates queries for all corporation historic market order data
 * 3. Fetches data in parallel using React Query's useQueries
 * 4. Combines results using a custom combine function
 * 5. Groups orders by corporation ID with deduplication
 * 
 * @returns {Object} Object containing corporation historic market orders data and states
 * @returns {Object} returns.data - Object with corporation IDs as keys and market order arrays as values
 * @returns {boolean} returns.isLoading - Whether any queries are still loading
 * @returns {boolean} returns.isError - Whether any queries have errors
 * @returns {Error|null} returns.error - First error encountered, if any
 * 
 * @example
 * function CorporationHistoricOrdersManager() {
 *   const { data: ordersByCorporation, isLoading, isError, error } = useGetAllCorporationHistoricMarketOrders();
 * 
 *   if (isLoading) return <div>Loading historic market orders...</div>;
 *   if (isError) return <div>Error: {error.message}</div>;
 *   
 *   return (
 *     <div>
 *       {Object.keys(ordersByCorporation).map(corpId => (
 *         <div key={corpId}>
 *           Corporation {corpId}: {ordersByCorporation[corpId].length} completed orders
 *         </div>
 *       ))}
 *     </div>
 *   );
 * }
 */
export function useGetAllCorporationHistoricMarketOrders() {
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

    // Extract data sources from results
    const dataSources = results.map(result => result.data);
    const marketOrdersObject = extractAndGroupMarketOrdersByCorporation(dataSources);

    return createSuccessObject(marketOrdersObject);
  }, []);

  const result = useQueries({
    queries: userArray.map(({ CharacterHash }) => corporationHistoricMarketOrdersQuery(CharacterHash)),
    combine: combineFunction,
  });

  return result;
}

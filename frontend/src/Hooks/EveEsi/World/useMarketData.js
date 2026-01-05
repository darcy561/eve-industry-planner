import { useQuery } from "@tanstack/react-query";
import getMarketData from "../../../Functions/EveESI/World/getMarketData";
import useESIRateLimiting from "../../useESIRateLimiting";

/**
 * Custom hook that fetches market data for a specific item and region from EVE ESI API.
 *
 * This hook provides market data fetching for EVE Online items:
 * - Fetches market orders for specific items in specific regions
 * - Handles pagination automatically for large market datasets
 * - Integrates with ESI rate limiting system
 * - Provides loading, error, and success states
 * - Uses React Query for caching and background updates
 * - Supports manual refetching for real-time data
 *
 * The fetching process:
 * 1. Checks ESI rate limits for market group
 * 2. Fetches market data page by page until all data is retrieved
 * 3. Combines all pages into a single array
 * 4. Handles rate limiting errors with appropriate wait times
 * 5. Caches data for 30 minutes with 5-minute stale time
 *
 * @param {number} typeID - EVE Online item type ID to fetch market data for
 * @param {Object} location - Location object containing region information
 * @param {number} location.regionID - EVE Online region ID for market data
 * @returns {Object} Object containing market data and states
 * @returns {Array<Object>} returns.marketData - Array of market order objects
 * @returns {boolean} returns.isLoading - Whether the query is still loading
 * @returns {Error|null} returns.error - Error object if an error occurred
 * @returns {Function} returns.refetch - Function to manually refetch the data
 *
 * @example
 * function MarketDataDisplay() {
 *   const { marketData, isLoading, error, refetch } = useMarketData(typeID, { regionID: 10000002 });
 *
 *   if (isLoading) return <div>Loading market data...</div>;
 *   if (error) return <div>Error: {error.message}</div>;
 *   return (
 *     <div>
 *       <button onClick={refetch}>Refresh</button>
 *       <div>Market Orders: {marketData.length}</div>
 *     </div>
 *   );
 * }
 */
export function useMarketData(typeID, location) {
  const { isRateLimited, getWaitTime } = useESIRateLimiting();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["marketData", typeID, location?.regionID],
    queryFn: async () => {
      // Check if market group is rate limited
      if (isRateLimited("market")) {
        const waitTime = getWaitTime("market");
        throw new Error(
          `Market group is rate limited. Wait ${Math.ceil(waitTime / 1000)} seconds.`
        );
      }

      const allPages = [];
      let currentPage = 1;
      let totalPages = 1;

      while (currentPage <= totalPages) {
        const result = await getMarketData({
          regionID: location.regionID,
          typeID,
          page: currentPage,
          config: {
            group: "market",
            priority: "normal",
            batchable: true,
          },
        });

        allPages.push(...result.data);
        totalPages = result.totalPages ?? 1;
        currentPage++;
      }

      return allPages;
    },
    enabled: !!typeID && !!location?.regionID && !isRateLimited("market"),
    staleTime: 5 * 60 * 1000, // 5 minutes
    cacheTime: 30 * 60 * 1000, // 30 minutes
    retry: 3,
    retryDelay: (attemptIndex, error) => {
      // If rate limited, use the wait time
      if (error?.message?.includes("rate limited")) {
        const waitTime = getWaitTime("market");
        return Math.max(waitTime, 1000); // At least 1 second
      }
      return Math.min(1000 * 2 ** attemptIndex, 30000);
    },
    refetchOnWindowFocus: false,
    refetchOnMount: true,
    refetchOnReconnect: true,
  });

  return {
    marketData: data || [],
    isLoading,
    error,
    refetch,
  };
}

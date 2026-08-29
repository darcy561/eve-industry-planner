import { useQuery } from "@tanstack/react-query";
import getMarketHistory from "../../../Functions/EveESI/World/getMarketHistory";
import getWorldData from "../../../Functions/EveESI/World/getWorldData";
import useUsersStore from "../../../Zustand/usersStore";
import useESIRateLimiting from "../../App/useESIRateLimiting";

/**
 * Custom hook that fetches market history data for a specific item and region from EVE ESI API.
 *
 * This hook provides market history data fetching for EVE Online items:
 * - Fetches historical market data for specific items in specific regions
 * - Transforms data to match expected format (date, highest, lowest, average, volume)
 * - Integrates with ESI rate limiting system
 * - Provides loading, error, and success states
 * - Uses React Query for caching and background updates
 * - Supports manual refetching for real-time data
 * - Handles ETag support for efficient data updates
 *
 * The fetching process:
 * 1. Validates typeID and regionID parameters
 * 2. Checks ESI rate limits for market group
 * 3. Fetches market history data with ETag support
 * 4. Transforms data to standardised format
 * 5. Handles rate limiting errors with appropriate wait times
 * 6. Retains inactive cache (gcTime) 30 minutes with 5-minute stale time
 *
 * @param {number} typeID - EVE Online item type ID to fetch market history for
 * @param {Object} location - Location object containing region information
 * @param {number} location.regionID - EVE Online region ID for market history
 * @returns {Object} Object containing market history data and states
 * @returns {Array<Object>} returns.marketHistory - Array of market history objects with date, highest, lowest, average, volume
 * @returns {boolean} returns.isLoading - Whether the query is still loading
 * @returns {Error|null} returns.error - Error object if an error occurred
 * @returns {Function} returns.refetch - Function to manually refetch the data
 *
 * @example
 * function MarketHistoryDisplay() {
 *   const { marketHistory, isLoading, error, refetch } = useMarketHistoryData(typeID, { regionID: 10000002 });
 *
 *   if (isLoading) return <div>Loading market history...</div>;
 *   if (error) return <div>Error: {error.message}</div>;
 *   return (
 *     <div>
 *       <button onClick={refetch}>Refresh</button>
 *       <div>History Entries: {marketHistory.length}</div>
 *       {marketHistory.map(entry => (
 *         <div key={entry.date}>
 *           {entry.date}: Avg {entry.average}, Vol {entry.volume}
 *         </div>
 *       ))}
 *     </div>
 *   );
 * }
 */
export function useMarketHistoryData(typeID, location) {
  const { isRateLimited, getWaitTime } = useESIRateLimiting();

  const {
    data,
    isLoading: isMarketHistoryLoading,
    error: marketHistoryError,
    refetch,
  } = useQuery({
    queryKey: ["marketHistory", typeID, location?.regionID],
    queryFn: async () => {
      if (!typeID || !location?.regionID) return null;

      // Check if market group is rate limited
      if (isRateLimited("market")) {
        const waitTime = getWaitTime("market");
        throw new Error(
          `Market group is rate limited. Wait ${Math.ceil(waitTime / 1000)} seconds.`
        );
      }

      const result = await getMarketHistory({
        regionID: location.regionID,
        typeID,
        existingData: {
          data: null,
          etag: null,
        },
        config: {
          group: "market",
          priority: "normal",
          batchable: true,
        },
      });

      // Transform the data to match the expected format
      const transformedData = result.data.map((item) => ({
        date: item.date,
        highest: item.highest,
        lowest: item.lowest,
        average: item.average,
        volume: item.volume,
      }));

      return transformedData || [];
    },
    enabled: !!typeID && !!location?.regionID && !isRateLimited("market"),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
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
    refetchOnMount: false,
  });

  const marketHistory = data || [];

  const {
    data: worldData,
    isLoading: isWorldDataLoading,
    error: worldDataError,
  } = useQuery({
    queryKey: ["marketHistoryWorldData", typeID, location?.regionID],
    queryFn: () =>
      getWorldData(
        [location.regionID],
        useUsersStore.getState().account.actions.getMainCharacter(),
      ),
    enabled: Boolean(location?.regionID && marketHistory.length > 0),
    staleTime: 5 * 60 * 1000,
  });

  return {
    marketHistory,
    worldData: worldData || {},
    isLoading: isMarketHistoryLoading,
    isEnriching: isWorldDataLoading,
    isMarketHistoryLoading,
    isWorldDataLoading,
    error: marketHistoryError || null,
    marketHistoryError: marketHistoryError || null,
    worldDataError: worldDataError || null,
    combinedError: marketHistoryError || worldDataError || null,
    refetch,
  };
}

export default useMarketHistoryData;

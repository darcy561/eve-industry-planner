import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import getMarketHistory from "../../../Functions/EveESI/World/getMarketHistory";
import useLocationNames from "../useLocationNames";
import useESIRateLimiting from "../../App/useESIRateLimiting";

/**
 * One type's daily price history across a region.
 *
 * ESI publishes history per region only, so a location the reader chose is
 * reduced to the one it sits in — a structure's history is its region's.
 *
 * @param {number} typeID
 * @param {object} location - The market the reader chose
 * @param {number} location.regionID - The region its history is asked for
 * @returns {{marketHistory: Array<object>, worldData: Object<string, object>,
 *   isLoading: boolean, error: Error|null, refetch: Function}}
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

      if (isRateLimited("market")) {
        const waitTime = getWaitTime("market");
        throw new Error(
          `Market group is rate limited. Wait ${Math.ceil(waitTime / 1000)} seconds.`,
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
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 3,
    retryDelay: (attemptIndex, error) => {
      if (error?.message?.includes("rate limited")) {
        const waitTime = getWaitTime("market");
        return Math.max(waitTime, 1000);
      }
      return Math.min(1000 * 2 ** attemptIndex, 30000);
    },
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  const marketHistory = data || [];

  const regionId = location?.regionID;
  // The region is asked for whether or not it has any history: the chart names it either way.
  const regionIds = useMemo(() => (regionId ? [regionId] : []), [regionId]);

  const {
    names: worldData,
    isLoading: isWorldDataLoading,
    error: worldDataError,
  } = useLocationNames(regionIds);

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

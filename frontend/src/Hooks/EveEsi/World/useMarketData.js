import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import getMarketData from "../../../Functions/EveESI/World/getMarketData";
import useLocationNames from "../useLocationNames";
import useESIRateLimiting from "../../App/useESIRateLimiting";
import { asNumberIDSet } from "../../../Functions/Helper/ids";
import {
  mergeCitadelOrders,
  placeOrdersInSystems,
  systemsOfPlaces,
} from "../../../Functions/MarketData/regionOrderMerge";
import { useCitadelOrdersQuery } from "../../React Query/World/citadelOrders";

/**
 * Every order for one type across a region, with the places they sit in named.
 *
 * ESI answers market orders per region, so a region is what is asked for and a
 * location the reader chose is reduced to the one it sits in. The answer carries
 * every place ESI publishes, player structures included; the citadels it does
 * not publish are read by the reader themselves and merged in here, so a caller
 * is handed the whole region rather than the public half of it.
 *
 * Paged whole before it resolves — a region runs to many pages and a partial
 * answer would read as a thin market rather than an incomplete one.
 *
 * @param {number} typeID
 * @param {object} location - The market the reader chose
 * @param {number} location.regionID - The region its orders are asked for
 * @param {number} [location.stationID]
 * @returns {{marketData: Array<object>, worldData: Object<string, object>,
 *   isLoading: boolean, isEnriching: boolean, error: Error|null,
 *   refetch: Function}}
 */
export function useMarketData(typeID, location) {
  const { isRateLimited, getWaitTime } = useESIRateLimiting();

  const {
    data,
    isLoading: isMarketDataLoading,
    error: marketDataError,
    refetch,
  } = useQuery({
    queryKey: ["marketData", typeID, location?.regionID],
    queryFn: async () => {
      if (isRateLimited("market")) {
        const waitTime = getWaitTime("market");
        throw new Error(
          `Market group is rate limited. Wait ${Math.ceil(waitTime / 1000)} seconds.`,
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
    refetchOnMount: true,
    refetchOnReconnect: true,
  });

  const { orders: citadelOrders } = useCitadelOrdersQuery(
    typeID,
    location?.regionID,
  );
  const orders = useMemo(
    () => mergeCitadelOrders(data || [], citadelOrders),
    [data, citadelOrders],
  );

  // Held as a key rather than a list: the name cache hands back a new object as
  // each name lands, and a list of ids rebuilt from that would re-ask for every
  // name on every one of them.
  const [systemsFound, setSystemsFound] = useState("");
  const heldSystems = (key) => (key ? key.split(",").map(Number) : []);
  const worldDataIDs = useMemo(() => {
    // The region is asked for whether or not any orders came back: its name is what the empty
    // market message says.
    if (!location) return [];

    return [
      ...asNumberIDSet([
        ...orders.flatMap((item) => [item.location_id, item.system_id]),
        ...(systemsFound ? systemsFound.split(",") : []),
        location.regionID,
        location.stationID,
      ]),
    ].sort((a, b) => a - b);
  }, [orders, systemsFound, location?.regionID, location?.stationID]);

  const {
    names: worldData,
    isLoading: isWorldDataLoading,
    error: worldDataError,
  } = useLocationNames(worldDataIDs);

  // Against what is held, not the render before — a name kept for the session is
  // already in hand on the first render, which `useHasChanged` reads as no
  // change, leaving the system it names never asked about.
  const named = systemsOfPlaces(
    orders,
    worldData,
    heldSystems(systemsFound),
  ).join(",");
  if (named !== systemsFound) {
    setSystemsFound(named);
  }

  const marketData = useMemo(
    () => placeOrdersInSystems(orders, worldData),
    [orders, worldData],
  );

  return {
    marketData,
    worldData: worldData || {},
    isLoading: isMarketDataLoading,
    isEnriching: isWorldDataLoading,
    isMarketDataLoading,
    isWorldDataLoading,
    error: marketDataError || null,
    marketDataError: marketDataError || null,
    worldDataError: worldDataError || null,
    combinedError: marketDataError || worldDataError || null,
    refetch,
  };
}

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { citadelsInRegion } from "../../../Functions/MarketData/registry/marketSources.js";
import {
  CITADEL_ORDERS_QUERY_KEY,
  ordersForTypeAtCitadels,
} from "../../../Functions/MarketData/citadels/ordersAtCitadels.js";
import { useMarketSources } from "../../Static/useMarketSources";

export { CITADEL_ORDERS_QUERY_KEY };

/** One reference for every empty answer, so a caller's memo does not rebuild. */
const NO_ORDERS = Object.freeze([]);

/**
 * One type's orders at the citadels a reader has saved in a region.
 *
 * The region's own orders come from ESI and carry the structures ESI publishes;
 * these are the ones it does not, read in the browser on the reader's token and
 * kept. Shaped like `useMarketData` so a surface drawing both is handed the same
 * thing twice.
 *
 * **Keyed by region, not by a market.** A saved citadel carries the region it
 * sits in, so a dialogue that has narrowed its location to a region already has
 * what it takes to find them — and a region holding several saved citadels
 * offers all of them, which is what a region-wide view is for.
 *
 * It reads what the rotation has already stored rather than fetching. Nothing is
 * spent by opening this, and a region with no saved citadel in it asks nothing
 * at all.
 *
 * **What makes it current is the walk, not a stale time.** Walking a market
 * replaces its stored orders, and the clock-moved listener in `priceCache.js`
 * invalidates this alongside the prices — so a surface left open across a
 * rotation is told, where anything waiting on age alone would sit on what it
 * read at mount.
 *
 * @param {number|string} typeID
 * @param {number|string} regionID
 * @returns {{orders: Array<object>, isLoading: boolean, error: Error|null}}
 */
export function useCitadelOrdersQuery(typeID, regionID) {
  const sources = useMarketSources();
  const citadels = useMemo(
    () => citadelsInRegion(sources, regionID),
    [sources, regionID],
  );

  // The markets themselves rather than the array holding them: the registry
  // hands out a new array whenever anything in it moves, and a key built from
  // that would re-read the store on every one of those.
  const asked = useMemo(
    () =>
      citadels
        .map((citadel) => citadel.id)
        .sort()
        .join(","),
    [citadels],
  );

  const { data, isLoading, error } = useQuery({
    queryKey: [...CITADEL_ORDERS_QUERY_KEY, String(typeID ?? ""), asked],
    queryFn: () => ordersForTypeAtCitadels(citadels, typeID),
    enabled: Boolean(typeID) && citadels.length > 0,
    gcTime: 5 * 60 * 1000,
  });

  return {
    orders: data ?? NO_ORDERS,
    isLoading,
    error: error ?? null,
  };
}

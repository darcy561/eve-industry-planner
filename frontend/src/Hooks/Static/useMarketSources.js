import { useMemo, useSyncExternalStore } from "react";

import { queryClient } from "../../queryClient";
import { allMarketSources } from "../../Functions/MarketData/registry/marketSources.js";
import { MARKET_LOCATIONS_QUERY_KEY } from "../../Functions/MarketData/registry/marketLocations.js";
import useUsersStore from "../../Zustand/usersStore";

/** Tells a subscriber when any cache entry moves, the composed set included. */
const watchTheCache = (onChange) =>
  queryClient.getQueryCache().subscribe(onChange);

/**
 * The composed set as the cache holds it. The same reference until it is
 * replaced, which is what stops this redrawing on every cache event.
 */
const composedNow = () => queryClient.getQueryData(MARKET_LOCATIONS_QUERY_KEY);

/**
 * Every market a price may be asked for.
 *
 * It subscribes rather than fetches, through the cache rather than `useQuery`,
 * so a surface offering a market needs no query provider standing over it.
 *
 * @returns {import("../../Functions/MarketData/registry/marketSources.js").MarketSource[]}
 */
export function useMarketSources() {
  const composed = useSyncExternalStore(watchTheCache, composedNow);
  const own = useUsersStore(
    (state) => state.applicationSettings.marketLocations,
  );

  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => allMarketSources(), [composed, own]);
}

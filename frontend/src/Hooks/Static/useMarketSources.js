import { useMemo, useSyncExternalStore } from "react";

import { queryClient } from "../../queryClient";
import { allMarketSources } from "../../Functions/MarketData/marketSources";
import { MARKET_LOCATIONS_QUERY_KEY } from "../../Functions/MarketData/marketLocations";
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
 * @returns {import("../../Functions/MarketData/marketSources").MarketSource[]}
 */
export function useMarketSources() {
  const composed = useSyncExternalStore(watchTheCache, composedNow);
  const own = useUsersStore(
    (state) => state.applicationSettings.marketLocations,
  );

  // The registry reads both of these out of module state rather than taking
  // them, so neither appears inside the memo — but they are what it is built
  // from, and naming them is what rebuilds the list when either moves. Without
  // them the list is computed once and a market shared with the reader never
  // appears; with them and no memo, every render hands surfaces a new array.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => allMarketSources(), [composed, own]);
}

/**
 * The registry for a caller outside render — a class method, a reducer, a
 * helper a component hands a value to. The same list the hooks read.
 *
 * @returns {import("../../Functions/MarketData/marketSources").MarketSource[]}
 */
export function readMarketSources() {
  return allMarketSources();
}

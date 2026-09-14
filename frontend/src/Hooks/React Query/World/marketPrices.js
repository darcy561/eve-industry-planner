import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  fetchPrices,
  MARKET_PRICES_QUERY_KEY,
} from "../../../Functions/MarketData/priceCache";
import { idsQueryKeySuffix } from "../idsQueryKey.js";
import {
  readAdjustedClock,
  readSourceClock,
} from "../../../Functions/MarketData/sourceClocks";

export { MARKET_PRICES_QUERY_KEY };

/**
 * Holds a surface behind the prices it reads.
 *
 * The prices themselves live one entry per type per market, so this fetches
 * nothing of its own: it asks for the wants and reports whether they have
 * settled, which is what a surface that draws figures synchronously needs to
 * know before it draws. A want already held and fresh is not asked about again,
 * so a second surface wanting the same material waits on nothing.
 *
 * A failed fetch is not retried — the views that use this draw without prices
 * rather than waiting behind a retry.
 *
 * @param {Array<{typeID: number|string, sourceID: string}>} wants - Each type
 *   paired with the market it is priced against, as `pricesWanted` resolves them
 * @param {Object} [options]
 * @param {Iterable<number|string>} [options.adjustedTypeIDs]
 * @param {boolean} [options.enabled=true]
 * @returns {{isLoading: boolean, isError: boolean, error: Error|null}}
 */
export function useMarketPricesQuery(
  wants,
  { adjustedTypeIDs = [], enabled = true } = {},
) {
  // The pairs themselves rather than the array handed over: a caller that
  // listed one twice, or in another order, is asking the same question, and a
  // key that said otherwise would fetch again on every render.
  const asked = useMemo(() => {
    const unique = new Map();
    for (const { typeID, sourceID } of wants ?? []) {
      unique.set(`${sourceID}|${typeID}`, { typeID, sourceID });
    }
    return [...unique.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [wants]);
  const adjusted = useMemo(
    () => idsQueryKeySuffix(adjustedTypeIDs),
    [adjustedTypeIDs],
  );

  const { isLoading, isError, error, data } = useQuery({
    queryKey: [
      ...MARKET_PRICES_QUERY_KEY,
      asked.map(([pair]) => pair).join(","),
      adjusted,
    ],
    queryFn: async () => {
      await fetchPrices({
        wants: asked.map(([, want]) => want),
        adjustedTypeIDs: adjusted ? adjusted.split(",") : [],
      });

      // The clocks the rows came back with, rather than the wants that were
      // asked. A surface reads its figures synchronously and subscribes to no
      // row, so this value is the only thing that can re-render it — and a
      // constant here makes a refetch invisible, leaving a reader on figures
      // the market has already replaced.
      return clocksFor(asked);
    },
    enabled: enabled && (asked.length > 0 || adjusted.length > 0),
    staleTime: 0,
    retry: false,
  });

  // `data` is read rather than ignored on purpose: the query tracks which of
  // its fields a caller uses and notifies only on those, so a hook that reads
  // none of it is never re-rendered when the prices behind it are replaced.
  // Returning the clocks is what lets a caller see a market's book move.
  return { isLoading, isError, error, clocks: data };
}

/** Each market's clock as it stands, keyed so a moved one changes the value. */
function clocksFor(asked) {
  const clocks = {};
  for (const [, { sourceID }] of asked) {
    clocks[sourceID] = readSourceClock(sourceID) ?? 0;
  }
  clocks.adjusted = readAdjustedClock() ?? 0;
  return clocks;
}

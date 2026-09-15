import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  fetchPrices,
  MARKET_PRICES_QUERY_KEY,
  readPrice,
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
      const { asked: attempted, failed } = await fetchPrices({
        wants: asked.map(([, want]) => want),
        adjustedTypeIDs: adjusted ? adjusted.split(",") : [],
      });

      // Every want failing is a fetch that did not happen, and a surface told
      // only that loading finished would wait on prices that are never coming.
      // One market failing among several is not this: the rest are drawable.
      if (attempted > 0 && failed === attempted) {
        throw new Error("no market could be reached for any wanted price");
      }

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

/**
 * Each market's clock as it stands, keyed so a moved one changes the value.
 *
 * **A market the browser fetches for itself is keyed per type.** Only the
 * markets this server walks have a clock of their own: a saved station's book is
 * read one type at a time and states its own freshness, so its clock is per
 * source and type and is carried on the row rather than held centrally. Keying
 * those by source alone would read as a constant zero, and a refetch after one
 * of its rows expired would refresh the cache while leaving the reader looking
 * at the figure it replaced.
 */
function clocksFor(asked) {
  const clocks = {};

  for (const [pair, { typeID, sourceID }] of asked) {
    const walked = readSourceClock(sourceID);
    if (walked !== undefined) {
      clocks[sourceID] = walked;
      continue;
    }
    clocks[pair] = readPrice(typeID, sourceID)?.refreshedAt ?? 0;
  }

  clocks.adjusted = readAdjustedClock() ?? 0;
  return clocks;
}

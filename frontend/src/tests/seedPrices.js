import { queryClient } from "../queryClient";
import {
  adjustedQueryKey,
  priceQueryKey,
} from "../Functions/MarketData/prices/priceCache.js";

/**
 * Puts prices into the cache as though they had already been fetched.
 *
 * A price lives in one entry per type per market, so a test wanting a material
 * already priced seeds those entries rather than a store: it is the same thing
 * the loader would have written, and every reader answers from it without
 * asking the API.
 *
 * The client is the module-level one, because that is the one the readers use —
 * they are mostly not components, so there is no provider to hand them another.
 *
 * @param {Object<string, Object<string, Object>>} prices - Market source id to
 *   type id to the figures held for it. Missing bases read as zero
 * @param {Object} [options]
 * @param {Object<string, number>} [options.adjusted] - Adjusted price by type id
 * @param {number} [options.refreshedAt] - When the figures were last refreshed
 */
export default function seedPrices(
  prices,
  { adjusted = {}, refreshedAt = Date.now() } = {},
) {
  for (const [marketLocation, typePrices] of Object.entries(prices)) {
    for (const [typeID, typePrice] of Object.entries(typePrices)) {
      queryClient.setQueryData(priceQueryKey(typeID, marketLocation), {
        buy: 0,
        sell: 0,
        buyP95: 0,
        sellP05: 0,
        refreshedAt,
        ...typePrice,
      });
    }
  }

  for (const [typeID, price] of Object.entries(adjusted)) {
    queryClient.setQueryData(adjustedQueryKey(typeID), price);
  }
}

/** Forgets everything seeded, so one test's prices are not another's. */
export function clearSeededPrices() {
  queryClient.removeQueries({ queryKey: ["market"] });
}

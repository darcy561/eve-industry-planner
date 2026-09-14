import useUsersStore from "../../../../Zustand/usersStore";
import {
  PRICING_SIDE,
  resolvePricingSide,
} from "../../../../Functions/MarketData/pricingSide.js";

/**
 * How a watchlist row is priced.
 *
 * A watched item is costed on both sides at once: its materials are bought, and
 * the item itself is valued at what it would fetch. That makes the watchlist the
 * one surface that reads both account defaults, which is why the pair is
 * resolved here rather than in each row.
 *
 * Only the selling market is taken. The column states what the item would fetch
 * listed, so the sell price is the figure it wants whatever basis the account
 * prices its own sales on.
 *
 * @returns {{buying: {marketLocation: string, listingType: string},
 *   sellingMarket: string}}
 */
export function useWatchlistPricing() {
  const accountPricing = useUsersStore(
    (state) => state.applicationSettings.defaultPricing,
  );

  return {
    buying: resolvePricingSide({
      accountPricing,
      side: PRICING_SIDE.BUYING,
    }),
    sellingMarket: resolvePricingSide({
      accountPricing,
      side: PRICING_SIDE.SELLING,
    }).marketLocation,
  };
}

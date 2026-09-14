import { useCallback, useMemo } from "react";
import useUsersStore from "../../../../Zustand/usersStore";
import { getMarketPriceForType } from "../../../../Functions/MarketData/marketPriceForType";
import {
  resolveFor,
  sideDefaults,
} from "../../../../Functions/MarketData/priceResolution";
import { PRICING_SIDE } from "../../../../Functions/MarketData/pricingSide.js";

/**
 * How a watchlist row is priced.
 *
 * A watched item is costed on both sides at once: its materials are bought, and
 * the item itself is valued at what it would fetch. That makes the watchlist the
 * one surface that reads both account defaults, which is why the pair is
 * resolved here rather than in each row.
 *
 * The rows read through the two functions rather than resolving a market of
 * their own, because which market a type is priced at is a per-type answer — a
 * material's market group can name one — and `pricesWantedByWatchlist` asks for
 * exactly what these two return.
 *
 * Only the sell basis is taken for worth. The column states what the item would
 * fetch listed, so the sell price is the figure it wants whatever basis the
 * account prices its own sales on.
 *
 * @returns {{listingType: string, buyingPrice: (typeID: number) => number,
 *   sellWorth: (typeID: number) => number}}
 */
export function useWatchlistPricing() {
  const accountPricing = useUsersStore(
    (state) => state.applicationSettings.defaultPricing,
  );

  const buying = useMemo(
    () => sideDefaults(PRICING_SIDE.BUYING, { accountPricing }),
    [accountPricing],
  );
  const selling = useMemo(
    () => sideDefaults(PRICING_SIDE.SELLING, { accountPricing }),
    [accountPricing],
  );

  const buyingPrice = useCallback(
    (typeID) => {
      const { marketLocation, listingType } = resolveFor(buying, null, typeID);
      return getMarketPriceForType(typeID, marketLocation, listingType);
    },
    [buying],
  );

  const sellWorth = useCallback(
    (typeID) =>
      getMarketPriceForType(
        typeID,
        resolveFor(selling, null, typeID).marketLocation,
        "sell",
      ),
    [selling],
  );

  return { listingType: buying.listingType, buyingPrice, sellWorth };
}

import { useEffect } from "react";
import useUsersStore from "../../Zustand/usersStore.js";
import {
  overrideUnlessDefault,
  PRICING_SIDE,
  resolvePricingSide,
} from "../../Functions/MarketData/defaults/pricingSide";

/**
 * Drops a job's own market or order type once it matches what the account defaults
 * to, so the job carries an override only while it differs.
 *
 * What a side defaults to is asked of the ladder with no job in it, rather than
 * read off the account: the selling side stores a route and derives its order
 * type from it, so an account answering `exit` alone would be read as answering
 * nothing and a reader's deliberate choice stripped as redundant.
 *
 * @param {Object|undefined} jobPricing - The job's own market choices
 * @param {(pricingPatch: Object) => void} updateActiveJobPricing
 */
export function useStripRedundantJobMarketHubOverrides(
  jobPricing,
  updateActiveJobPricing,
) {
  const accountPricing = useUsersStore(
    (s) => s.applicationSettings.defaultPricing,
  );

  useEffect(() => {
    if (!jobPricing) return;

    let changed = false;
    const kept = {};

    for (const side of Object.values(PRICING_SIDE)) {
      const chosen = jobPricing[side] ?? {};
      const { marketLocation: canonMarket, orderType: canonOrderType } =
        resolvePricingSide({ accountPricing, side });

      const market = overrideUnlessDefault(chosen.market, canonMarket) ?? null;
      const orderType =
        overrideUnlessDefault(chosen.orderType, canonOrderType) ?? null;

      if (market !== (chosen.market ?? null)) changed = true;
      if (orderType !== (chosen.orderType ?? null)) changed = true;
      kept[side] = { market: market ?? null, orderType: orderType ?? null };
    }

    if (!changed) return;

    const stillChosen = Object.values(kept).some(
      (side) => side.market || side.orderType,
    );
    updateActiveJobPricing({ localPricing: stillChosen ? kept : null });
  }, [jobPricing, accountPricing, updateActiveJobPricing]);
}

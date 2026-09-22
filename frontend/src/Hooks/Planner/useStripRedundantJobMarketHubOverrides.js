import { useEffect } from "react";
import useUsersStore from "../../Zustand/usersStore.js";
import { PRICING_SIDE } from "../../Functions/MarketData/pricingSide.js";
import GLOBAL_CONFIG from "../../global-config-app";

const { DEFAULT_MARKET_OPTION, DEFAULT_ORDER_TYPE } = GLOBAL_CONFIG;

/**
 * Drops a job's own market or order type once it matches what the account defaults
 * to, so the job carries an override only while it differs.
 *
 * Each side is judged against its own default: a job that names the buying
 * market the account already buys at is redundant on that side alone, and its
 * selling choice is left as it is.
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
      const canonMarket =
        accountPricing?.[side]?.market ?? DEFAULT_MARKET_OPTION;
      const canonOrderType =
        accountPricing?.[side]?.orderType ?? DEFAULT_ORDER_TYPE;

      const market = chosen.market === canonMarket ? null : chosen.market;
      const orderType =
        chosen.orderType === canonOrderType ? null : chosen.orderType;

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

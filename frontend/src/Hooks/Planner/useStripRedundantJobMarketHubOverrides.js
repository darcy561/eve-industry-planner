import { useEffect } from "react";
import useUsersStore from "../../Zustand/usersStore.js";
import { PRICING_SIDE } from "../../Functions/MarketData/pricingSide.js";
import GLOBAL_CONFIG from "../../global-config-app";

const { DEFAULT_MARKET_OPTION, DEFAULT_ORDER_OPTION } = GLOBAL_CONFIG;

/**
 * Drops a job's own market or basis once it matches what the account defaults
 * to, so the job carries an override only while it differs.
 *
 * Each side is judged against its own default: a job that names the buying
 * market the account already buys at is redundant on that side alone, and its
 * selling choice is left as it is.
 *
 * @param {Object} activeJob
 * @param {(pricingPatch: Object) => void} updateActiveJobPricing
 */
export function useStripRedundantJobMarketHubOverrides(
  activeJob,
  updateActiveJobPricing,
) {
  const accountPricing = useUsersStore(
    (s) => s.applicationSettings.defaultPricing,
  );
  const jobPricing = activeJob?.build?.localPricing;

  useEffect(() => {
    if (!jobPricing) return;

    let changed = false;
    const kept = {};

    for (const side of Object.values(PRICING_SIDE)) {
      const chosen = jobPricing[side] ?? {};
      const canonMarket =
        accountPricing?.[side]?.market ?? DEFAULT_MARKET_OPTION;
      const canonBasis = accountPricing?.[side]?.basis ?? DEFAULT_ORDER_OPTION;

      const market = chosen.market === canonMarket ? null : chosen.market;
      const basis = chosen.basis === canonBasis ? null : chosen.basis;

      if (market !== (chosen.market ?? null)) changed = true;
      if (basis !== (chosen.basis ?? null)) changed = true;
      kept[side] = { market: market ?? null, basis: basis ?? null };
    }

    if (!changed) return;

    const stillChosen = Object.values(kept).some(
      (side) => side.market || side.basis,
    );
    updateActiveJobPricing({ localPricing: stillChosen ? kept : null });
  }, [jobPricing, accountPricing, updateActiveJobPricing]);
}

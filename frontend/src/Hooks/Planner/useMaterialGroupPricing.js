import { useMemo } from "react";

import { groupPricingFor } from "../../Functions/MarketData/marketGroupData.js";
import useUsersStore from "../../Zustand/usersStore.js";

/**
 * What the market group rung needs to answer a material row, for a component.
 *
 * The rule for when the rung can answer at all lives with the data it reads, so
 * the panel and the shopping list — which has no hook available — cannot come to
 * different conclusions about whether a group default applies.
 *
 * @param {object} params
 * @param {string} params.side - One of PRICING_SIDE
 * @param {string} params.marketLocationRung - Which rung answered the panel's market
 * @param {string} params.listingTypeRung - Which rung answered the panel's listing type
 * @returns {import("../../Functions/MarketData/materialPricing.js").GroupPricing|undefined}
 */
export function useMaterialGroupPricing({
  side,
  marketLocationRung,
  listingTypeRung,
}) {
  const groupDefaults = useUsersStore(
    (s) => s.applicationSettings.defaultPricing?.[side]?.groups,
  );

  return useMemo(
    () =>
      groupPricingFor({ groupDefaults, marketLocationRung, listingTypeRung }),
    [groupDefaults, marketLocationRung, listingTypeRung],
  );
}

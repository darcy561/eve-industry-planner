import { useMemo } from "react";
import useUsersStore from "../../Zustand/usersStore.js";
import { resolvePricingSideRungs } from "../../Functions/MarketData/pricingSide.js";

/**
 * Where one side of a job is priced, from the job's own choice down to the
 * global default.
 *
 * The side is the caller's to name: a surface knows whether it is asking what
 * something costs to buy or what it fetches when sold, and nothing here can
 * infer it.
 *
 * The rung that answered each axis is reported alongside it, because the market
 * group walk sits between this answer and a row's own override and has to know
 * what it would be displacing. A caller with no rung of its own to insert reads
 * the two values and ignores the rest.
 *
 * @param {object} layout - The job's layout
 * @param {string} side - One of PRICING_SIDE
 * @returns {{marketLocation: string, listingType: string,
 *   marketLocationRung: string, listingTypeRung: string}}
 */
export function useEffectiveMarketHubFromLayout(layout, side) {
  const accountPricing = useUsersStore(
    (s) => s.applicationSettings.defaultPricing,
  );
  const jobPricing = layout?.localPricing;

  return useMemo(
    () => resolvePricingSideRungs({ jobPricing, accountPricing, side }),
    [jobPricing, accountPricing, side],
  );
}

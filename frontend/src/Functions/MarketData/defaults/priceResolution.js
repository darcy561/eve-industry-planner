import useUsersStore from "../../../Zustand/usersStore";
import { groupPricingFor } from "./marketGroupData";
import { getEffectiveMaterialPriceHub } from "./materialPricing";
import { resolvePricingSideRungs } from "./pricingSide.js";

/**
 * @typedef {object} SideDefaults
 * @property {string} marketLocation - What the side prices against before any
 *   nearer rung answers
 * @property {string} orderType
 * @property {object|undefined} groupPricing - The market group table and the
 *   rungs it may outrank, or undefined where the account priced no group
 */

/**
 * Resolves one side's rungs once, ready to answer per type, the job's own choice
 * belonging here rather than in the per-type call.
 *
 * @param {string} side - One of PRICING_SIDE
 * @param {object} [params]
 * @param {object} [params.jobPricing] - `build.localPricing`, where there is a job
 * @param {object} [params.accountPricing] - Defaults to the account's stored pricing
 * @returns {SideDefaults}
 */
export function sideDefaults(side, { jobPricing, accountPricing } = {}) {
  const pricing =
    accountPricing ??
    useUsersStore.getState().applicationSettings.defaultPricing;

  const { marketLocation, orderType, marketLocationRung, orderTypeRung } =
    resolvePricingSideRungs({ jobPricing, accountPricing: pricing, side });

  return {
    marketLocation,
    orderType,
    groupPricing: groupPricingFor({
      groupDefaults: pricing?.[side]?.groups,
      marketLocationRung,
      orderTypeRung,
    }),
  };
}

/**
 * Where one type is priced, given a side already resolved.
 *
 * @param {SideDefaults} defaults
 * @param {object|null} build - The job's build, holding any per-material
 *   override. Null for a caller with no job, such as a shopping list
 * @param {number|string} typeID
 * @returns {{marketLocation: string, orderType: string}}
 */
export function resolveFor(defaults, build, typeID) {
  return getEffectiveMaterialPriceHub(
    build,
    typeID,
    defaults.marketLocation,
    defaults.orderType,
    defaults.groupPricing,
  );
}

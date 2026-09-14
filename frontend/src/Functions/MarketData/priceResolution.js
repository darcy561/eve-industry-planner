import useUsersStore from "../../Zustand/usersStore";
import { groupPricingFor } from "./marketGroupData";
import { getEffectiveMaterialPriceHub } from "./materialPricing";
import { resolvePricingSideRungs } from "./pricingSide.js";

/**
 * Which market and listing type one side of a job prices against.
 *
 * **One place answers this for every caller outside render.** Deciding what to
 * fetch and reading it back are two paths that must agree exactly: a fetch that
 * resolved one market while the reader resolved another would warm a cache entry
 * nothing looks at and hand the reader a zero, with nothing anywhere reporting a
 * problem. Written twice they agreed on the day and nothing held them to it.
 *
 * The React path composes the same pieces through `useEffectiveMarketHubFromLayout`
 * and `useMaterialGroupPricing`, which exist to re-render when a rung moves; both
 * end in the same `getEffectiveMaterialPriceHub`.
 */

/**
 * @typedef {object} SideDefaults
 * @property {string} marketLocation - What the side prices against before any
 *   nearer rung answers
 * @property {string} listingType
 * @property {object|undefined} groupPricing - The market group table and the
 *   rungs it may outrank, or undefined where the account priced no group
 */

/**
 * Resolves one side's rungs once, ready to answer per type.
 *
 * **The job's own choice belongs here, not in the per-type call.**
 * `getEffectiveMaterialPriceHub` answers rungs 1 and 3 — a material's override
 * and its market group — and takes everything beneath them as already resolved.
 * A caller that left `jobPricing` out would price a job against the account's
 * market while every surface read it at the job's, which is the fetch and the
 * read disagreeing silently.
 *
 * The account's default and its group table are resolved here rather than per
 * material: only the group walk is a per-item question.
 *
 * @param {string} side - One of PRICING_SIDE
 * @param {object} [params]
 * @param {object} [params.jobPricing] - `layout.localPricing`, where there is a job
 * @param {object} [params.accountPricing] - Defaults to the account's stored pricing
 * @returns {SideDefaults}
 */
export function sideDefaults(side, { jobPricing, accountPricing } = {}) {
  const pricing =
    accountPricing ??
    useUsersStore.getState().applicationSettings.defaultPricing;

  const { marketLocation, listingType, marketLocationRung, listingTypeRung } =
    resolvePricingSideRungs({ jobPricing, accountPricing: pricing, side });

  return {
    marketLocation,
    listingType,
    groupPricing: groupPricingFor({
      groupDefaults: pricing?.[side]?.groups,
      marketLocationRung,
      listingTypeRung,
    }),
  };
}

/**
 * Where one type is priced, given a side already resolved.
 *
 * @param {SideDefaults} defaults
 * @param {object|null} layout - The job's layout, holding any per-material
 *   override. Null for a caller with no job, such as a shopping list
 * @param {number|string} typeID
 * @returns {{marketLocation: string, listingType: string}}
 */
export function resolveFor(defaults, layout, typeID) {
  return getEffectiveMaterialPriceHub(
    layout,
    typeID,
    defaults.marketLocation,
    defaults.listingType,
    defaults.groupPricing,
  );
}

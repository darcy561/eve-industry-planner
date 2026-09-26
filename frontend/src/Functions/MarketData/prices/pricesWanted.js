import { PRICING_SIDE } from "../defaults/pricingSide";
import { wantKey } from "../registry/marketSources.js";
import { resolveFor, sideDefaults } from "../defaults/priceResolution.js";
import { materialTypeIDsOf } from "../../../Components/Edit Job/Edit Job Hooks/jobSelectors";

/**
 * Which market each of a job's figures is priced against, answered per material
 * through the same resolution the readers use.
 *
 * @param {Array<Object>|Object} inputJobs
 * @param {Object} [accountPricing] - Defaults to the account's stored pricing.
 *   Taken rather than read where a caller re-resolves as it moves, so what the
 *   wants depend on is visible at the call site
 * @returns {{wants: Array<{typeID: number, marketLocation: string}>,
 *   adjustedTypeIDs: number[]}}
 */
export function pricesWantedBy(inputJobs, accountPricing) {
  const jobs = Array.isArray(inputJobs) ? inputJobs : [inputJobs];

  const wants = new Map();
  const adjustedTypeIDs = new Set();

  for (const job of jobs) {
    if (!job) continue;

    const jobPricing = job.build?.localPricing;
    const buying = sideDefaults(PRICING_SIDE.BUYING, {
      jobPricing,
      accountPricing,
    });
    const selling = sideDefaults(PRICING_SIDE.SELLING, {
      jobPricing,
      accountPricing,
    });

    for (const typeID of materialTypeIDsOf(job.build?.materials)) {
      add(wants, typeID, resolveFor(buying, job.build, typeID).marketLocation);
      adjustedTypeIDs.add(typeID);
    }

    if (job.itemID != null) {
      add(
        wants,
        job.itemID,
        resolveFor(selling, job.build, job.itemID).marketLocation,
      );
    }
  }

  return { wants: [...wants.values()], adjustedTypeIDs: [...adjustedTypeIDs] };
}

/**
 * Which market each of a bare list of types is priced against, for a caller with
 * types but no job and so no per-item override.
 *
 * @param {Iterable<number|string>} typeIDs
 * @param {string} side - One of PRICING_SIDE
 * @returns {{wants: Array<{typeID: number|string, marketLocation: string}>}}
 */
export function pricesWantedForTypes(typeIDs, side) {
  const defaults = sideDefaults(side);

  const wants = new Map();
  for (const typeID of typeIDs ?? []) {
    add(wants, typeID, resolveFor(defaults, null, typeID).marketLocation);
  }
  return { wants: [...wants.values()] };
}

function add(wants, typeID, marketLocation) {
  if (typeID == null || !marketLocation) return;
  wants.set(wantKey(marketLocation, typeID), { typeID, marketLocation });
}

/**
 * Which market each figure on the watchlist is priced against, a watched item
 * being costed on both sides at once and so wanted twice.
 *
 * @param {Array<Object>} items - `userWatchlist.items`
 * @param {Object} [accountPricing] - Defaults to the account's stored pricing
 * @returns {{wants: Array<{typeID: number|string, marketLocation: string}>}}
 */
export function pricesWantedByWatchlist(items, accountPricing) {
  const buying = sideDefaults(PRICING_SIDE.BUYING, { accountPricing });
  const selling = sideDefaults(PRICING_SIDE.SELLING, { accountPricing });

  const wants = new Map();
  const at = (defaults, typeID) =>
    typeID == null ? null : resolveFor(defaults, null, typeID).marketLocation;

  for (const item of items ?? []) {
    add(wants, item?.typeID, at(selling, item?.typeID));

    for (const material of item?.materials ?? []) {
      const { typeID } = material ?? {};
      add(wants, typeID, at(buying, typeID));
      add(wants, typeID, at(selling, typeID));

      for (const component of material?.materials ?? []) {
        add(wants, component?.typeID, at(buying, component?.typeID));
      }
    }
  }

  return { wants: [...wants.values()] };
}

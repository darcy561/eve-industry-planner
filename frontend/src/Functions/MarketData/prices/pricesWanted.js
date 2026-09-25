import { PRICING_SIDE } from "../defaults/pricingSide";
import { wantKey } from "../registry/marketSources.js";
import { resolveFor, sideDefaults } from "../defaults/priceResolution.js";
import { materialTypeIDsOf } from "../../../Components/Edit Job/Edit Job Hooks/jobSelectors";

/**
 * Which market each of a job's figures is actually priced against.
 *
 * A job does not price everything at one market. A material can carry its own
 * override, its market group can name one, and the job's own choice sits above
 * the account's — so the answer is per material, through the same resolution the
 * readers use. Asking for every type at every market instead would fetch four
 * times what anything reads, which is the cost this stage exists to remove.
 *
 * The output's own market is the selling side's, which is a different question
 * from where its materials are bought and frequently a different answer.
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

    // Per job rather than once for the batch: a job's own choice of market is a
    // rung, and two jobs in one call can answer it differently.
    const jobPricing = job.build?.localPricing;
    const buying = sideDefaults(PRICING_SIDE.BUYING, {
      jobPricing,
      accountPricing,
    });
    const selling = sideDefaults(PRICING_SIDE.SELLING, {
      jobPricing,
      accountPricing,
    });

    // What the job is made of, and not what it makes: the output is priced
    // below, at the market it will be sold on rather than bought at.
    for (const typeID of materialTypeIDsOf(job.build?.materials)) {
      add(wants, typeID, resolveFor(buying, job.build, typeID).marketLocation);
      // The install cost estimate prices materials at CCP's adjusted price,
      // which belongs to no market and is wanted for the same set.
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
 * Which market each of a bare list of types is priced against.
 *
 * For a caller with types but no job — a shopping list, which carries no build
 * and so no per-item override. The market group rung still answers per item,
 * which is why this walks rather than resolving one market for the list.
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
 * Which market each figure on the watchlist is priced against.
 *
 * A watched item is costed on both sides at once, which makes it the one surface
 * asking two markets for the same walk: its materials are bought, and the item
 * and each material are also valued at what they would fetch. So a material is
 * wanted twice, and the two answers are frequently different markets.
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

import { getMarketGroups } from "../Helper/getCachedData";
import staticFile from "../Static/staticFile";
import {
  primeItems,
  itemRecord,
  readItemRecords,
  resetItems,
} from "../Static/items";

/**
 * The market group tree, held where the pricing rung can read it without awaiting.
 *
 * A static file the app already downloads and caches. What this adds is a
 * synchronous read, which the rung cannot do without: the walk runs per material
 * on every row of every job, and one of its callers prices a shopping list from a
 * class method where no hook can be called.
 *
 * Reading is therefore separate from loading. `primeMarketGroupData` is awaited
 * once by whatever can wait; every read after that is a plain lookup that reports
 * absence rather than blocking. Which group an item sits in is the item list's to
 * say, so that half is read from its owner rather than held again here.
 */

const tree = staticFile(getMarketGroups, (groups) => groups || {});

/**
 * Loads the tree once, and the item list it reads groups from, for a caller that
 * can wait.
 *
 * @returns {Promise<void>}
 */
export async function primeMarketGroupData() {
  // Both halves, not just the tree: the item half is held by its own module and can be dropped on
  // its own, which would leave this short-circuiting on a tree whose items had gone.
  if (tree.read() && readItemRecords()) return;

  await Promise.all([tree.prime(), primeItems()]);
}

/**
 * The tree, or null until it has loaded.
 *
 * Null rather than an empty tree on purpose: a walk over an empty one answers
 * nothing for every item, which reads as a tree disagreeing with the defaults set
 * against it rather than as data that has not arrived.
 *
 * @returns {Object<string, {name: string, parent_id?: number}>|null}
 */
export function readMarketGroups() {
  return tree.read();
}

/**
 * Which market group an item sits in, or undefined where nothing says.
 *
 * Most unpublished types carry no market group, so undefined is an ordinary
 * answer rather than a missing item.
 *
 * @param {number} typeID
 * @returns {number|undefined}
 */
export function marketGroupOf(typeID) {
  return itemRecord(typeID)?.market_group_id;
}

/**
 * What the market group rung needs to answer a row, or undefined where it cannot
 * answer at all.
 *
 * Undefined until every part is present: a walk with no tree cannot climb and one
 * with no defaults has nothing to find, so the ladder then reads exactly as it did
 * before this rung existed rather than answering from half the data.
 *
 * The rungs are carried rather than resolved here, because the walk sits below a
 * job's own choice and above the account's — what it may displace depends on which
 * rung answered, and only the caller knows that.
 *
 * @param {object} params
 * @param {Object<string, {market?: string, basis?: string}>|undefined} params.groupDefaults
 * @param {string} params.marketRung
 * @param {string} params.listingRung
 * @returns {import("./materialPricing.js").GroupPricing|undefined}
 */
export function groupPricingFor({ groupDefaults, marketRung, listingRung }) {
  if (Object.keys(groupDefaults ?? {}).length === 0) return undefined;

  const marketGroups = readMarketGroups();
  if (!marketGroups) return undefined;

  return {
    marketGroups,
    groupDefaults,
    marketGroupOf,
    marketRung,
    listingRung,
  };
}

/** Drops what has been loaded. Tests only. */
export function resetMarketGroupData() {
  tree.reset();
  // The item half of what this primes is the item list's to hold, so dropping the tree without
  // dropping that would leave a caller reading groups for items from a load this one did not make.
  resetItems();
}

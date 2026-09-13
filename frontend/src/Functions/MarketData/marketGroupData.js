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
 * What sits directly inside a market group, or at the top of the tree.
 *
 * The published file carries each group's children, so this is a lookup rather
 * than a walk: deriving it from the parent links would mean inverting the whole
 * tree on first open, in every session, for an answer that never changes.
 *
 * Ordered by name, because a reader browsing is looking for one; the file orders
 * children by id, which is what makes a published build comparable to the last.
 *
 * @param {number|null} [parentID] - null or omitted for the roots
 * @returns {Array<{id: number, name: string, hasChildren: boolean, hasTypes: boolean}>}
 */
export function childrenOf(parentID = null) {
  return childrenIn(tree.read(), parentID);
}

/**
 * The same answer, against a tree the caller already holds.
 *
 * React reads this file through the query cache while the pricing rung reads the
 * copy held here, and the two are primed separately — so a caller that has a tree
 * passes it rather than asking which copy arrived first.
 *
 * @param {Object<string, Object>|null|undefined} groups
 * @param {number|null} [parentID]
 * @returns {Array<{id: number, name: string, hasChildren: boolean, hasTypes: boolean,
 *   iconTypeID?: number}>}
 */
export function childrenIn(groups, parentID = null) {
  if (!groups) return [];

  const ids = parentID
    ? (groups[String(parentID)]?.children ?? [])
    : rootIDs(groups);

  return ids
    .map((id) => {
      const group = groups[String(id)];
      if (!group) return null;
      return {
        id,
        name: group.name,
        hasChildren: (group.children?.length ?? 0) > 0,
        hasTypes: Boolean(group.has_types),
        iconTypeID: group.icon_type_id,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The groups nothing contains.
 *
 * Read by scanning rather than from a published list: a root is simply a group
 * with no parent, and a second way of saying so could disagree with the parent
 * links themselves.
 *
 * @param {Object<string, {parent_id?: number}>} groups
 * @returns {number[]}
 */
function rootIDs(groups) {
  const roots = [];
  for (const [key, group] of Object.entries(groups)) {
    if (group.parent_id) continue;
    const id = Number(key);
    if (Number.isFinite(id)) roots.push(id);
  }
  return roots;
}

/**
 * What contains a group, outermost first, ending with the group itself.
 *
 * A reader choosing "Minerals" is shown where it sits, because the name alone
 * does not say whether it is the one they meant. The same parent links the
 * pricing rung climbs, so the path and the resolution cannot disagree about
 * parentage.
 *
 * Capped like the rung's own walk: a cycle in the published file would otherwise
 * build a path forever. Nothing in the data does that, but this runs per row of
 * a list a reader is scrolling.
 *
 * @param {number|null|undefined} groupID
 * @returns {Array<{id: number, name: string}>}
 */
export function ancestorPath(groupID) {
  return ancestorPathIn(tree.read(), groupID);
}

/**
 * The same answer, against a tree the caller already holds.
 *
 * @param {Object<string, Object>|null|undefined} groups
 * @param {number|null|undefined} groupID
 * @returns {Array<{id: number, name: string}>}
 */
export function ancestorPathIn(groups, groupID) {
  if (!groups || !groupID) return [];

  const path = [];
  let id = groupID;
  for (let step = 0; step < MAX_PATH_DEPTH && id; step += 1) {
    const group = groups[String(id)];
    if (!group) break;
    path.unshift({
      id: Number(id),
      name: group.name,
      iconTypeID: group.icon_type_id,
    });
    id = group.parent_id;
  }

  return path;
}

/**
 * How far a path may climb before it stops looking.
 *
 * EVE's tree is six groups deep at its deepest, so anything longer has met a
 * cycle the published file should not contain.
 */
const MAX_PATH_DEPTH = 32;

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

import { getMarketGroups } from "../../Helper/getCachedData";
import staticFile from "../../Static/staticFile";
import {
  primeItems,
  itemRecord,
  readItemRecords,
  resetItems,
} from "../../Static/items";

const tree = staticFile(getMarketGroups, (groups) => groups || {});

/**
 * Loads the tree once, and the item list it reads groups from, for a caller that
 * can wait.
 *
 * @returns {Promise<void>}
 */
export async function primeMarketGroupData() {
  if (tree.read() && readItemRecords()) return;

  await Promise.all([tree.prime(), primeItems()]);
}

/**
 * The tree, or null until it has loaded — an empty tree would read as one
 * disagreeing with the defaults set against it.
 *
 * @returns {Object<string, {name: string, parent_id?: number}>|null}
 */
export function readMarketGroups() {
  return tree.read();
}

/**
 * What sits directly inside a market group, or at the top of the tree, ordered
 * by name for a reader browsing.
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
 * The groups nothing contains, scanned from the parent links rather than read
 * from a published list that could disagree with them.
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
 * What contains a group, outermost first, ending with the group itself, climbing
 * the same parent links the pricing rung does.
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
 * How far a path may climb before it stops looking. EVE's tree is six groups
 * deep at its deepest.
 */
const MAX_PATH_DEPTH = 32;

/**
 * Which market group an item sits in, or undefined where nothing says, which is
 * ordinary for an unpublished type.
 *
 * @param {number} typeID
 * @returns {number|undefined}
 */
export function marketGroupOf(typeID) {
  return itemRecord(typeID)?.market_group_id;
}

/**
 * What the market group rung needs to answer a row, or undefined until every
 * part is present rather than an answer from half the data.
 *
 * @param {object} params
 * @param {Object<string, {market?: string, orderType?: string}>|undefined} params.groupDefaults
 * @param {string} params.marketLocationRung
 * @param {string} params.orderTypeRung
 * @returns {import("./materialPricing.js").GroupRungContext|undefined}
 */
export function groupPricingFor({
  groupDefaults,
  marketLocationRung,
  orderTypeRung,
}) {
  if (Object.keys(groupDefaults ?? {}).length === 0) return undefined;

  const marketGroups = readMarketGroups();
  if (!marketGroups) return undefined;

  return {
    marketGroups,
    groupDefaults,
    marketGroupOf,
    marketLocationRung,
    orderTypeRung,
  };
}

/** Drops what has been loaded. Tests only. */
export function resetMarketGroupData() {
  tree.reset();
  resetItems();
}

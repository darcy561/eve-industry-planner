import { OFFICE_FOLDER_FLAG } from "./buildAssetNodes";
import {
  isNoAccessLocation,
  UNNAMED_LOCATION_LABEL,
  UNRESOLVED_LOCATION_LABEL,
} from "./assetLocationConstants";

/** No ids failed, for a caller that does not ask about them. */
const NO_FAILURES = new Set();

/**
 * Whether a node is one of the rows shown directly under a location or compartment.
 *
 * An office folder is a wrapper rather than a row of its own, so the hangar divisions inside it
 * read as top rows the way a station's hangar contents do.
 *
 * @param {import("./buildAssetNodes").AssetNode} node
 * @param {Map<number, import("./buildAssetNodes").AssetNode>} byItemId
 * @returns {boolean}
 */
function isTopRow(node, byItemId) {
  if (node.flag === OFFICE_FOLDER_FLAG) return false;
  if (node.parentId === null) return true;
  return byItemId.get(node.parentId)?.flag === OFFICE_FOLDER_FLAG;
}

/**
 * The top rows at each location, keyed by location id.
 *
 * Narrowing is on `rootFlag`, the compartment a node sits in at its location, so a crate in
 * Deliveries and everything inside it belong to Deliveries together. The raw `location_flag` cannot
 * do this: a stack inside that crate carries `Unlocked` like any other container's contents.
 *
 * `includeLocations` names locations that belong in the answer whether or not anything is at them:
 * a corporation renting an office it has emptied still rents it. `excludeItemIds` drops individual
 * items, which is how the asset views leave blueprints out.
 *
 * @param {import("./buildAssetNodes").AssetCollection} collection
 * @param {{rootFlags?: Iterable<string>, excludeRootFlags?: Iterable<string>, includeLocations?: Iterable<number>, excludeItemIds?: Set<number>}} [narrow]
 * @returns {Map<number, Array<import("./buildAssetNodes").AssetNode>>}
 */
export function assetRowsByLocation(
  collection,
  { rootFlags, excludeRootFlags, includeLocations, excludeItemIds } = {},
) {
  const byLocation = new Map();

  for (const locationId of includeLocations ?? []) {
    byLocation.set(locationId, []);
  }

  if (!collection) return byLocation;

  const wanted = rootFlags ? new Set(rootFlags) : null;
  const unwanted = excludeRootFlags ? new Set(excludeRootFlags) : null;

  for (const node of collection.nodes) {
    if (!isTopRow(node, collection.byItemId)) continue;
    if (wanted && !wanted.has(node.rootFlag)) continue;
    if (unwanted && unwanted.has(node.rootFlag)) continue;
    if (excludeItemIds?.has(node.itemId)) continue;

    const held = byLocation.get(node.locationId);
    if (held) {
      held.push(node);
    } else {
      byLocation.set(node.locationId, [node]);
    }
  }

  return byLocation;
}

/**
 * A location's rows split by the compartment they sit in.
 *
 * @param {Array<import("./buildAssetNodes").AssetNode>} rows
 * @returns {Map<string, Array<import("./buildAssetNodes").AssetNode>>}
 */
export function rowsByCompartment(rows = []) {
  const byFlag = new Map();

  for (const node of rows) {
    const held = byFlag.get(node.rootFlag);
    if (held) {
      held.push(node);
    } else {
      byFlag.set(node.rootFlag, [node]);
    }
  }

  return byFlag;
}

/**
 * Nodes ordered by the name of what they are.
 *
 * Returns a new array: the collection is shared by every consumer of the scope, so sorting one of
 * its rows in place would reorder it for all of them.
 *
 * @param {Array<import("./buildAssetNodes").AssetNode>} nodes
 * @param {Object<string, {name: string}>} [itemRecords]
 * @returns {Array<import("./buildAssetNodes").AssetNode>}
 */
export function sortNodesByName(nodes = [], itemRecords = {}) {
  return [...nodes].sort((a, b) => {
    const left = itemRecords[a.typeId]?.name;
    const right = itemRecords[b.typeId]?.name;
    if (!left || !right) return 0;
    return left.localeCompare(right);
  });
}

/**
 * The item ids worth asking ESI for a player-given name.
 *
 * Only a container can carry one, and a node holding nothing is not a container.
 *
 * @param {import("./buildAssetNodes").AssetCollection} collection
 * @returns {number[]}
 */
export function namedContainerIds(collection) {
  const ids = [];

  for (const node of collection?.nodes ?? []) {
    if (node.childIds.length > 0 && node.flag !== OFFICE_FOLDER_FLAG) {
      ids.push(node.itemId);
    }
  }

  return ids;
}

/**
 * The locations a corporation rents an office at, as its assets show them.
 *
 * @param {import("./buildAssetNodes").AssetCollection} collection
 * @returns {number[]}
 */
export function officeLocationIds(collection) {
  const ids = new Set();

  for (const node of collection?.nodes ?? []) {
    if (node.flag === OFFICE_FOLDER_FLAG) ids.add(node.locationId);
  }

  return [...ids];
}

/**
 * A location as a surface shows it.
 *
 * A location nobody could name is described rather than dropped: the name already says so, and the
 * flag lets a surface say it its own way. Hiding it instead would read as the place not existing.
 *
 * `failed` names the ids whose lookup did not settle. Such an id has no entry in `names` — a failure
 * is never cached — so it is only distinguishable from one still being asked about by being in
 * there, and it is labelled rather than left blank.
 *
 * @param {number} locationId
 * @param {Object<string, {name: string}>} names
 * @param {Set<number>} [failed]
 * @returns {{locationId: number, name: string, unnamed: boolean, unresolved: boolean, unreadable: boolean}}
 */
export function describeLocation(locationId, names, failed = NO_FAILURES) {
  const known = names[locationId];
  const unresolved = !known && failed.has(locationId);
  return {
    locationId,
    // A settled answer with no name still gets said out loud, so a place nothing can name reads as
    // that rather than as a blank row.
    name: known
      ? (known.name ?? UNNAMED_LOCATION_LABEL)
      : unresolved
        ? UNRESOLVED_LOCATION_LABEL
        : "",
    unnamed: Boolean(known) && !known.name,
    unresolved,
    unreadable: isNoAccessLocation(known),
  };
}

/**
 * The order locations are shown in: by name, the ones carrying no name after them, and the ones the
 * account cannot read last. A location whose name has not resolved keeps its place — it is still
 * where the assets are.
 *
 * @param {{name: string, unnamed: boolean, unresolved: boolean, unreadable: boolean}} a
 * @param {{name: string, unnamed: boolean, unresolved: boolean, unreadable: boolean}} b
 * @returns {number}
 */
export function byLocationOrder(a, b) {
  if (a.unreadable !== b.unreadable) return a.unreadable ? 1 : -1;
  // A place with no name sits below the named ones rather than under whatever letter its stand-in
  // label happens to start with. One whose lookup failed sits there too: both are a row the reader
  // cannot act on by name.
  const aNameless = a.unnamed || a.unresolved;
  const bNameless = b.unnamed || b.unresolved;
  if (aNameless !== bNameless) return aNameless ? 1 : -1;
  if (!a.name || !b.name) return a.name ? -1 : b.name ? 1 : 0;
  return a.name.localeCompare(b.name);
}

/**
 * Locations and what sits at each, in display order.
 *
 * @param {Iterable<[number, T]>} entries - location id and whatever is at it
 * @param {Object<string, {name: string}>} names
 * @param {Set<number>} [failed] - ids whose lookup did not settle, labelled rather than left blank
 * @returns {Array<{locationId: number, name: string, unreadable: boolean, rows: T}>}
 * @template T
 */
export function orderLocations(entries, names, failed) {
  return [...entries]
    .map(([locationId, rows]) => ({
      ...describeLocation(locationId, names, failed),
      rows,
    }))
    .sort(byLocationOrder);
}

/**
 * Locations on their own, in display order — what a picker offers.
 *
 * An id still being asked about is held back rather than offered as a blank row: a picker row with
 * no label says nothing a reader can act on, and the name is moments away. A place ESI answered
 * about and had no name for is offered like any other, under the stand-in label — that is an
 * answer, and saying it is better than a gap where a place was asked for.
 *
 * An id whose lookup *failed* is held back too, unless `failed` is passed. A failure is never
 * cached, so it would otherwise be offered on every render for the rest of the session under a
 * label saying nothing; a surface that would rather show the place than lose it hands the set in.
 *
 * @param {Iterable<number>} locationIds
 * @param {Object<string, {name: string}>} names
 * @param {Set<number>} [failed] - ids whose lookup did not settle, offered when given
 * @returns {Array<{locationId: number, name: string, unreadable: boolean}>}
 */
export function locationOptions(locationIds, names, failed) {
  return [...locationIds]
    .filter((locationId) => names[locationId] || failed?.has(locationId))
    .map((locationId) => describeLocation(locationId, names, failed))
    .sort(byLocationOrder);
}

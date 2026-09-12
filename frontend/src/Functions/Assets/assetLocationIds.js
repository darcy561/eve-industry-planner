import { LOCATION_KIND } from "./assetLocationConstants";

/**
 * The location kinds a player can be shown as a place to hold or source things from.
 *
 * Asset safety is deliberately absent: items there are held by CONCORD awaiting delivery, not
 * sitting somewhere the player can work from.
 *
 * @type {Set<string>}
 */
const PLACE_KINDS = new Set([
  LOCATION_KIND.STATION,
  LOCATION_KIND.STRUCTURE,
  LOCATION_KIND.SYSTEM,
  LOCATION_KIND.ABYSSAL_SYSTEM,
]);

/**
 * The distinct locations a collection's assets sit at.
 *
 * A node's location is the end of its chain, so a crate three containers deep counts toward the
 * station holding it and appears once.
 *
 * @param {import("./buildAssetNodes").AssetCollection} collection
 * @returns {number[]} ascending by id; ordering for display is the caller's, once names are known
 */
export default function assetLocationIds(collection) {
  const ids = new Set();

  for (const node of collection?.nodes ?? []) {
    if (PLACE_KINDS.has(node.locationKind)) ids.add(node.locationId);
  }

  return [...ids].sort((a, b) => a - b);
}

/**
 * The ids among these that ESI will never name.
 *
 * A ship flying in space is absent from the asset set while the things aboard it are not, so each
 * of them holds the ship's own item id as its location — an id in the same range a structure's sits
 * in. Asked of ESI as a place it is refused, for every character, on every ask, and a refusal costs
 * five times what an answer does against the error budget.
 *
 * Every surface that walks the nodes itself filters through this, so a new one cannot quietly
 * reintroduce the storm. A caller taking its ids from `assetLocationIds` above needs no filter —
 * that one admits only the place kinds, and a ship is not among them.
 *
 * @param {import("./buildAssetNodes").AssetCollection} collection
 * @returns {Set<number>}
 */
export function unnameableLocationIds(collection) {
  const ids = new Set();

  for (const node of collection?.nodes ?? []) {
    if (node.locationKind === LOCATION_KIND.SHIP) ids.add(node.locationId);
  }

  return ids;
}

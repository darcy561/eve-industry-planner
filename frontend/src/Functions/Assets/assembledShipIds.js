import { ITEM_CATEGORY } from "../Shared/itemCategories";

/**
 * Location flags that only ever describe a ship's own fittings and bays.
 *
 * These answer for a hull the static item list cannot name — one too new for the build the browser
 * holds, or in a group the SDE gives no category for. Only a ship files things in a fitting slot or
 * a specialised hold.
 *
 * `RigSlot` is deliberately absent. An Upwell structure carries rigs too, and a corporation's
 * assets include the structures it owns, so keeping it would hide a corporation's citadels.
 *
 * @type {string[]}
 */
const SHIP_FITTING_PREFIXES = [
  "HiSlot",
  "MedSlot",
  "LoSlot",
  "SubSystemSlot",
  "SubSystemBay",
  "DroneBay",
  "FighterBay",
  "FighterTube",
  "FrigateEscapeBay",
  "Specialized",
];

/** The states an Upwell structure's own modules sit in; nothing fitted to a ship uses them. */
const STRUCTURE_PREFIX = "Structure";

function isShipFitting(flag = "") {
  if (flag.startsWith(STRUCTURE_PREFIX)) return false;
  return SHIP_FITTING_PREFIXES.some((prefix) => flag.startsWith(prefix));
}

function holdsShipFittings(node, byItemId) {
  return node.childIds.some((childId) =>
    isShipFitting(byItemId.get(childId)?.flag),
  );
}

/**
 * The assembled ships in a collection, as the item ids of the ships themselves.
 *
 * A packaged hull is stock rather than a ship in use — it stacks, ESI marks it as not singleton,
 * and it stays. What goes is the assembled one, and with it everything reachable only through it:
 * its modules, its drones and its cargo.
 *
 * @param {import("./buildAssetNodes").AssetCollection} collection
 * @param {Object<string, {category_id?: number}>} [itemRecords]
 * @returns {Set<number>}
 */
export default function assembledShipIds(collection, itemRecords = {}) {
  const ships = new Set();

  for (const node of collection?.nodes ?? []) {
    const category = itemRecords[node.typeId]?.category_id;

    if (category === ITEM_CATEGORY.SHIP) {
      if (node.isSingleton) ships.add(node.itemId);
      continue;
    }

    // A named type that is not a ship is settled; only an unnamed one falls through to what it
    // holds, so a container is never mistaken for a hull.
    if (
      category === undefined &&
      holdsShipFittings(node, collection.byItemId)
    ) {
      ships.add(node.itemId);
    }
  }

  return ships;
}

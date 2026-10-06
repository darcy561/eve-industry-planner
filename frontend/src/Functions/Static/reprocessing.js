import { getReprocessingData } from "../Helper/getCachedData";
import { reprocessingItemTypes } from "../../Context/defaultValues";
import staticFile, { byName, nameKey } from "./staticFile";

/** The kinds ore selection may choose from: each gives fixed minerals, which gas and random outputs do not. */
const SELECTABLE_TYPES = new Set([
  reprocessingItemTypes.ore,
  reprocessingItemTypes.moonOre,
  reprocessingItemTypes.ice,
]);

const reprocessing = staticFile(getReprocessingData, (data) => ({
  items: data?.items ?? {},
  materialVolumes: data?.materialVolumes ?? {},
}));

export const primeReprocessing = reprocessing.prime;
export const resetReprocessing = reprocessing.reset;
export const subscribeReprocessing = reprocessing.subscribe;

/**
 * Every reprocessable item, keyed by type id, or null before the file arrives.
 *
 * @returns {Object<string, Object>|null}
 */
export function readReprocessingItems() {
  return reprocessing.read()?.items ?? null;
}

const selectable = reprocessing.view(({ items }) =>
  Object.values(items).filter((item) => SELECTABLE_TYPES.has(item.itemType)),
);
const producible = reprocessing.view(({ items }) => {
  const typeIDs = new Set();
  for (const item of Object.values(items)) {
    if (!SELECTABLE_TYPES.has(item.itemType)) continue;
    for (const typeID of Object.keys(item.materials ?? {})) {
      typeIDs.add(Number(typeID));
    }
  }
  return typeIDs;
});
const itemsByName = reprocessing.view(({ items }) =>
  byName(Object.values(items)),
);

/**
 * The items ore selection may choose from.
 *
 * @returns {Array<Object>}
 */
export function selectableItems() {
  return selectable() ?? [];
}

/**
 * Whether ore, moon ore or ice gives a material, so it can be planned as bought as ore.
 *
 * @param {number|string} typeID
 * @returns {boolean} false before the file arrives
 */
export function producibleByReprocessing(typeID) {
  return producible()?.has(Number(typeID)) ?? false;
}

/**
 * Every material ore, moon ore or ice gives, by type id.
 *
 * @returns {Array<number>}
 */
export function producibleTypeIDs() {
  return [...(producible() ?? [])];
}

/**
 * The item a pasted line names.
 *
 * @param {string} [name]
 * @returns {Object|undefined}
 */
export function reprocessableByName(name) {
  const key = nameKey(name);
  return key ? itemsByName()?.get(key) : undefined;
}

/**
 * The volume of one unit of a reprocessable item or of a material one gives, in m³.
 *
 * @param {number|string} typeID
 * @returns {number|undefined} undefined when the file has not arrived or holds no volume for the type
 */
export function volumeOf(typeID) {
  const file = reprocessing.read();
  if (!file) return undefined;
  return file.items[typeID]?.volume ?? file.materialVolumes[typeID];
}

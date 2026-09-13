import { getReprocessingData } from "../Helper/getCachedData";
import { reprocessingItemTypes } from "../../Context/defaultValues";
import staticFile, { byName, nameKey } from "./staticFile";

/**
 * What can be reprocessed, held where the calculation can read it without awaiting twice.
 *
 * Both directions of the calculation want it — turning pasted ore into minerals, and choosing ore to
 * produce wanted minerals — and each wants a different view, so the views are built once rather than
 * walked again per call.
 */

/** The types ore selection may choose from. Gas reprocesses into gas, so it is never a source. */
const SELECTABLE_TYPES = new Set([
  reprocessingItemTypes.ore,
  reprocessingItemTypes.unrefinedOre,
  reprocessingItemTypes.moonOre,
  reprocessingItemTypes.ice,
]);

const reprocessing = staticFile(getReprocessingData, (data) => data || {});

export const primeReprocessing = reprocessing.prime;
export const readReprocessingItems = reprocessing.read;
export const resetReprocessing = reprocessing.reset;

const selectable = reprocessing.view((items) =>
  Object.values(items).filter((item) => SELECTABLE_TYPES.has(item.itemType)),
);
const itemsByName = reprocessing.view((items) => byName(Object.values(items)));

/**
 * The items ore selection may choose from.
 *
 * @returns {Array<Object>}
 */
export function selectableItems() {
  return selectable() ?? [];
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

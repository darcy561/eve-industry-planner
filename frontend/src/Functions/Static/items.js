import { getFullItemList, getSearchIndex } from "../Helper/getCachedData";
import staticFile, { byName, nameKey } from "./staticFile";

/** Shown wherever the list carries no record for a type, with the type id beside it. */
export const UNKNOWN_ITEM_LABEL = "Unknown Item";

/**
 * What a surface shows for a type: its name, or one label for an item the list cannot name.
 *
 * @param {number} typeID
 * @param {Object<string, {name?: string}>} [records]
 * @returns {string}
 */
export function itemNameFrom(typeID, records) {
  return records?.[typeID]?.name ?? `${UNKNOWN_ITEM_LABEL} - ${typeID}`;
}

const records = staticFile(getFullItemList, (list) => list || {});
const search = staticFile(getSearchIndex, (index) => index || []);

export const primeItems = records.prime;
export const readItemRecords = records.read;
export const subscribeItemRecords = records.subscribe;
export const primeItemSearchIndex = search.prime;

const searchByName = search.view((entries) => byName(entries));
const recordsByName = records.view((all) => byName(Object.values(all)));

/**
 * One item's record, or undefined where the file has not loaded or does not carry the type.
 *
 * @param {number} typeID
 * @returns {Object|undefined}
 */
export function itemRecord(typeID) {
  return records.read()?.[typeID];
}

/**
 * The item record a name belongs to, or undefined where the file has not loaded or names no such item.
 *
 * @param {string} [name]
 * @returns {Object|undefined}
 */
export function itemRecordByName(name) {
  const key = nameKey(name);
  return key ? recordsByName()?.get(key) : undefined;
}

/**
 * The search index entry an item's name belongs to.
 *
 * @param {string} [name]
 * @returns {Object|undefined}
 */
export function searchEntryByName(name) {
  const key = nameKey(name);
  return key ? searchByName()?.get(key) : undefined;
}

/**
 * The same match against an index a caller already holds, for a hook that has subscribed to it
 * rather than primed it.
 *
 * @param {Array<Object>} entries
 * @param {string} [name]
 * @returns {Object|undefined}
 */
export function searchEntryByNameIn(entries, name) {
  const key = nameKey(name);
  if (!key || !entries?.length) return undefined;
  return byName(entries).get(key);
}

/** Forgets both files, so the next prime reads them again. */
export function resetItems() {
  records.reset();
  search.reset();
}

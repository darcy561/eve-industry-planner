import { getFullItemList, getSearchIndex } from "../Helper/getCachedData";

/**
 * The item files, held where a caller that cannot await can read them.
 *
 * Both are static files the app already downloads and caches. What this adds is a synchronous read,
 * which some callers cannot do without: a shopping list is priced from a class method and a fit is
 * parsed from clipboard text, neither of which is a place a hook can be called.
 *
 * Reading is therefore separate from loading. {@link primeItems} is awaited once by whatever can
 * wait; every read after that is a plain lookup that reports absence rather than blocking.
 */

/** Shown wherever the list carries no record for a type, with the type id beside it. */
export const UNKNOWN_ITEM_LABEL = "Unknown Item";

/**
 * What a surface shows for a type, whatever the list holds for it.
 *
 * One label for an unnameable item across the app: a row without a name is still a row worth
 * reading, because the figures beside it mean something against the type id.
 *
 * @param {number} typeID
 * @param {Object<string, {name?: string}>} [records]
 * @returns {string}
 */
export function itemNameFrom(typeID, records) {
  return records?.[typeID]?.name ?? `${UNKNOWN_ITEM_LABEL} - ${typeID}`;
}

let records = null;
let searchIndex = null;
let searchByName = null;
let primingRecords = null;
let primingSearchIndex = null;

/**
 * Loads the item records once, for a caller that can wait.
 *
 * Concurrent callers share the one load, and a failure is not remembered as an answer, so a later
 * caller retries rather than inheriting an outage.
 *
 * The search index is a separate file and a separate load: most callers want one or the other, and
 * pricing a row should not wait on the file the fit importer reads.
 *
 * @returns {Promise<void>}
 */
export function primeItems() {
  if (records) return Promise.resolve();

  primingRecords ??= getFullItemList()
    .then((list) => {
      records = list || {};
    })
    .finally(() => {
      primingRecords = null;
    });

  return primingRecords;
}

/**
 * Loads the search index once, for a caller that can wait.
 *
 * @returns {Promise<void>}
 */
export function primeItemSearchIndex() {
  if (searchIndex) return Promise.resolve();

  primingSearchIndex ??= getSearchIndex()
    .then((index) => {
      searchIndex = index || [];
      searchByName = null;
    })
    .finally(() => {
      primingSearchIndex = null;
    });

  return primingSearchIndex;
}

/**
 * One item's record, or undefined where the file has not loaded or does not carry the type.
 *
 * @param {number} typeID
 * @returns {Object|undefined}
 */
export function itemRecord(typeID) {
  return records?.[typeID];
}

/**
 * Every item record keyed by type id, or null until the file has loaded.
 *
 * Null rather than an empty map on purpose: a lookup against an empty one answers nothing for every
 * type, which reads as the list disagreeing with what was asked of it rather than as data that has
 * not arrived.
 *
 * @returns {Object<string, Object>|null}
 */
export function readItemRecords() {
  return records;
}

/**
 * The search index entry an item's name belongs to.
 *
 * Matched through a name-keyed map built on first use rather than by scanning the array: the
 * callers here match a whole pasted fit, so a scan per line is a scan of every buildable item per
 * line.
 *
 * @param {string} [name]
 * @returns {Object|undefined}
 */
export function searchEntryByName(name) {
  if (!name || !searchIndex?.length) return undefined;
  searchByName ??= byLowercaseName(searchIndex);
  return searchByName.get(name.trim().toLowerCase());
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
  if (!name || !entries?.length) return undefined;
  return byLowercaseName(entries).get(name.trim().toLowerCase());
}

/**
 * Forgets both files, so the next {@link primeItems} loads them again.
 *
 * The app refreshes its static data on a timer, and a new SDE build is a different file behind the
 * same key — so what is held here has to be droppable without a reload.
 */
export function resetItems() {
  records = null;
  searchIndex = null;
  searchByName = null;
  primingRecords = null;
  primingSearchIndex = null;
}

function byLowercaseName(entries) {
  const map = new Map();
  for (const entry of entries) {
    if (entry?.name) map.set(entry.name.toLowerCase(), entry);
  }
  return map;
}

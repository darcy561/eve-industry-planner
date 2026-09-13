import { useMemo } from "react";
import { useCachedData } from "../App/useCachedData";
import { CACHED_DATA_FILES } from "../../Context/defaultValues";
import { itemNameFrom } from "../../Functions/Static/items";

const EMPTY_RECORDS = {};
const EMPTY_NAMES = {};
const EMPTY_SEARCH = [];

/**
 * Every item record, keyed by type id.
 *
 * One cache entry for the whole file rather than one per type: the list arrives as a single static
 * download and a type's record never changes while the app is open, so a caller reads the map and
 * indexes it. The per-id cache next door is for names that have to be asked for one at a time.
 *
 * A caller wanting only names takes {@link useItemNames}, which narrows to the ids a view holds.
 *
 * @returns {{records: Object<string, Object>, isLoading: boolean, isError: boolean, error: Error|null}}
 */
export function useItemList() {
  const { data, isLoading, isError, error } = useCachedData(
    CACHED_DATA_FILES.FULL_ITEM_LIST,
  );

  return {
    records: data ?? EMPTY_RECORDS,
    isLoading,
    isError,
    error: error ?? null,
  };
}

/**
 * One item's record, or undefined while the list is loading and for a type it does not carry.
 *
 * @param {number} [typeID]
 * @returns {Object|undefined}
 */
export function useItemRecord(typeID) {
  const { records } = useItemList();
  return typeID ? records[typeID] : undefined;
}

/**
 * Names for a set of items, keyed by type id.
 *
 * The fallback belongs here rather than at each call site: an item the list cannot name reads the
 * same wherever it is shown, and a row without a name is still a row worth reading because the
 * figures beside it mean something against the type id.
 *
 * @param {Array<number>|Array<{typeID: number}>} [items] - type ids, or rows carrying one
 * @returns {Object<string, string>}
 */
export function useItemNames(items) {
  const { records, isLoading } = useItemList();
  // Callers hand this a list built in render — `rows`, `data?.items ?? []` — so the ids themselves
  // decide whether there is anything new to name, not the array holding them.
  const key = typeIDKey(items);

  return useMemo(() => {
    // Nothing rather than the fallback while the file is still arriving: an id the list has simply
    // not been read for yet is not an id it has no name for, and naming it here would show the
    // fallback for a frame and replace it with the real name.
    if (!key || isLoading) return EMPTY_NAMES;
    const names = {};
    for (const typeID of key.split(",")) {
      names[typeID] = itemNameFrom(typeID, records);
    }
    return names;
  }, [key, isLoading, records]);
}

/**
 * The search index: one entry per buildable item, carrying the blueprint that makes it.
 *
 * A different file from the records above and a different shape — an array a reader searches, not a
 * map a view indexes — so the two are never handed to a caller under one name.
 *
 * @returns {{entries: Array<Object>, isLoading: boolean, isError: boolean, error: Error|null}}
 */
export function useItemSearchIndex() {
  const { data, isLoading, isError, error } = useCachedData(
    CACHED_DATA_FILES.SEARCH_INDEX,
  );

  return {
    entries: data ?? EMPTY_SEARCH,
    isLoading,
    isError,
    error: error ?? null,
  };
}

/**
 * The search index as it already sits in the cache, for a caller deriving a value outside a render
 * and so unable to subscribe.
 *
 * Empty where it has not loaded, which a caller reads as an index that cannot answer yet rather
 * than one that answered nothing — the same thing a subscribed reader sees before it arrives.
 *
 * @param {import("@tanstack/react-query").QueryClient} queryClient
 * @returns {Array<Object>}
 */
export function readCachedItemSearchIndex(queryClient) {
  return (
    queryClient.getQueryData(["static", CACHED_DATA_FILES.SEARCH_INDEX]) ??
    EMPTY_SEARCH
  );
}

/**
 * What identifies a requested set of ids, for a memo that must not rebuild on an array built in
 * render. Empty for an empty ask, so a caller with nothing to name holds the shared empty object.
 *
 * @param {Array<number>|Array<{typeID: number}>} [items]
 * @returns {string}
 */
function typeIDKey(items) {
  if (!items?.length) return "";
  return items
    .map((item) => (typeof item === "object" ? item?.typeID : item))
    .filter((typeID) => typeID !== undefined && typeID !== null)
    .join(",");
}

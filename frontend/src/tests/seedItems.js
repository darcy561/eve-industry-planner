import { CACHED_DATA_FILES } from "../Context/defaultValues";

/**
 * Puts item records into a query client as though the static file had already loaded.
 *
 * The list lives in one cache entry for the whole file, so a test wanting items already named seeds
 * that entry rather than a store: it is the same thing the reader would have written, and every
 * hook over it reads without the file being fetched.
 *
 * @param {import("@tanstack/react-query").QueryClient} queryClient
 * @param {Object<string, string|Object>} records - type id to a name, or to a whole record
 */
export function seedItemRecords(queryClient, records) {
  const entries = {};
  for (const [typeID, record] of Object.entries(records)) {
    entries[typeID] =
      typeof record === "string"
        ? { name: record, type_id: Number(typeID) }
        : { type_id: Number(typeID), ...record };
  }
  queryClient.setQueryData(
    ["static", CACHED_DATA_FILES.FULL_ITEM_LIST],
    entries,
  );
}

/**
 * Puts a search index into a query client as though the static file had already loaded.
 *
 * @param {import("@tanstack/react-query").QueryClient} queryClient
 * @param {Array<Object>} entries
 */
export function seedItemSearchIndex(queryClient, entries) {
  queryClient.setQueryData(["static", CACHED_DATA_FILES.SEARCH_INDEX], entries);
}

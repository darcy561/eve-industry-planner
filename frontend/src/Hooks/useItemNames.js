import { useMemo } from "react";
import { useCachedData } from "./App/useCachedData";
import { CACHED_DATA_FILES } from "../Context/defaultValues";

/**
 * Item names for the rows on screen, from the cached static list.
 *
 * One read for every caller, mapped in render — a name per id would be a promise
 * per row, and a promise in a component is state and an effect.
 *
 * @param {{typeID: number}[]} items
 * @returns {Record<number, string>}
 */
export function useItemNames(items) {
  const { data: list } = useCachedData(CACHED_DATA_FILES.FULL_ITEM_LIST);

  return useMemo(() => {
    if (!list) return {};
    return Object.fromEntries(
      items.map(({ typeID }) => [typeID, list[typeID]?.name ?? `Type ${typeID}`]),
    );
  }, [items, list]);
}

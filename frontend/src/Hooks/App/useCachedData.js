import { useQuery } from "@tanstack/react-query";
import {
  getSearchIndex,
  getFullItemList,
  getReprocessingData,
  getRecipeListFromCache,
} from "../../Functions/Helper/getCachedData";
import { CACHED_DATA_FILES } from "../../Context/defaultValues";

const READERS = {
  [CACHED_DATA_FILES.SEARCH_INDEX]: getSearchIndex,
  [CACHED_DATA_FILES.FULL_ITEM_LIST]: getFullItemList,
  [CACHED_DATA_FILES.REPROCESSING_DATA]: getReprocessingData,
  [CACHED_DATA_FILES.RECIPE_LIST]: getRecipeListFromCache,
};

/**
 * One of the static data files, for a component.
 *
 * No cache options: getCachedData keys its parsed payload by the versioned URL,
 * and a stale time here would hold a superseded parse past a new build. What
 * this adds is the read's state, shared by every component asking for the same
 * file rather than one copy each.
 *
 * @param {string} dataType - a CACHED_DATA_FILES value
 */
export function useCachedData(dataType) {
  return useQuery({
    queryKey: ["static", dataType],
    queryFn: () => {
      const read = READERS[dataType];
      if (!read) throw new Error(`Unknown data type: ${dataType}`);
      return read();
    },
  });
}

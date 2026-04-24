import { useState, useEffect } from "react";
import {
  getSearchIndex,
  getFullItemList,
  getReprocessingData,
  getRecipeListFromCache,
} from "../../Functions/Helper/getCachedData";
import { CACHED_DATA_FILES } from "../../Context/defaultValues";

export function useCachedData(dataType) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;
    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);
        let result;
        switch (dataType) {
          case CACHED_DATA_FILES.SEARCH_INDEX:
            result = await getSearchIndex();
            break;
          case CACHED_DATA_FILES.FULL_ITEM_LIST:
            result = await getFullItemList();
            break;
          case CACHED_DATA_FILES.REPROCESSING_DATA:
            result = await getReprocessingData();
            break;
          case CACHED_DATA_FILES.RECIPE_LIST:
            result = await getRecipeListFromCache();
            break;
          default:
            throw new Error(`Unknown data type: ${dataType}`);
        }

        if (isMounted) setData(result);
      } catch (err) {
        if (isMounted) setError(err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadData();
    return () => {
      isMounted = false;
    };
  }, [dataType]);

  return { data, loading, error };
}

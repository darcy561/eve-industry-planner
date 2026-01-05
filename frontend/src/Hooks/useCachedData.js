import { useState, useEffect } from "react";
import {
  getSearchIndex,
  getFullItemList,
  getReprocessingData,
  getRecipeListFromCache,
} from "../Functions/Helper/getCachedData";
import { CACHED_DATA_FILES } from "../Context/defaultValues";

/**
 * Custom hook that loads cached data files based on the specified data type
 * 
 * This hook:
 * - Loads different types of cached data based on the dataType parameter
 * - Handles loading states and error management
 * - Uses appropriate cache loading functions for each data type
 * - Includes cleanup to prevent state updates on unmounted components
 * - Provides detailed error logging for debugging
 * 
 * Supported data types:
 * - CACHED_DATA_FILES.SEARCH_INDEX: Search index for item lookups
 * - CACHED_DATA_FILES.FULL_ITEM_LIST: Complete list of EVE Online items
 * - CACHED_DATA_FILES.REPROCESSING_DATA: Data for reprocessing calculations
 * - CACHED_DATA_FILES.RECIPE_LIST: Manufacturing recipe data
 * 
 * @param {string} dataType - The type of cached data to load (from CACHED_DATA_FILES)
 * 
 * @returns {Object} Object containing:
 *   - data: The loaded cached data (null while loading or on error)
 *   - loading: Boolean indicating if data is currently being loaded
 *   - error: Error object if an error occurred during loading
 * 
 * @example
 * function ItemSearch() {
 *   const { data: searchIndex, loading, error } = useCachedData(CACHED_DATA_FILES.SEARCH_INDEX);
 * 
 *   if (loading) return <div>Loading search index...</div>;
 *   if (error) return <div>Error loading data: {error.message}</div>;
 * 
 *   return <div>Search index loaded with {searchIndex.length} items</div>;
 * }
 */
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

        if (isMounted) {
          setData(result);
        }
      } catch (err) {
        console.error(`[App] useCachedData: Error loading ${dataType}:`, err);
        console.error(`[App] useCachedData: Error type:`, err.constructor.name);
        console.error(`[App] useCachedData: Error message:`, err.message);
        console.error(`[App] useCachedData: Error stack:`, err.stack);

        if (isMounted) {
          setError(err);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadData();

    return () => {
      isMounted = false;
    };
  }, [dataType]);

  return { data, loading, error };
}

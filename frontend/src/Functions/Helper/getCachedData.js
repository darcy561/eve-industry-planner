import {
  STATIC_DATA_CACHE,
  CACHED_DATA_FILES,
} from "../../Context/defaultValues";
import * as Sentry from "@sentry/react";
import {
  getFileMetadata,
  getDataFileFromStorage,
} from "../Firebase/getDataFilesFromStorage";

/**
 * Checks if a file exists in the cache and returns the data if found
 * @param {string} fileName - The name of the file to check
 * @returns {Promise<Object|null>} The parsed data from cache if found, null otherwise
 */
export async function checkFileInCache(fileName) {
  try {
    // Check if Cache API is available (not available in all contexts)
    if (typeof caches === 'undefined') {
      return null;
    }
    
    const cache = await caches.open(STATIC_DATA_CACHE);
    const cacheUrl = `/data/${fileName}`;
    const cachedResponse = await cache.match(cacheUrl);

    if (cachedResponse) {
      const text = await cachedResponse.text();
      return JSON.parse(text);
    }

    return null;
  } catch (error) {
    console.error(
      `[App] checkFileInCache: Error checking cache for ${fileName}:`,
      error
    );
    return null;
  }
}

/**
 * Checks if cached data is stale by comparing with Firebase Storage metadata
 * @param {string} fileName - The name of the file to check
 * @returns {Promise<boolean>} True if cache is stale and needs refresh, false if cache is fresh
 */
export async function isCacheStale(fileName) {
  try {
    // Check if Cache API is available (not available in all contexts)
    if (typeof caches === 'undefined') {
      return true; // If no cache API, consider it stale so data is fetched
    }
    
    const cache = await caches.open(STATIC_DATA_CACHE);
    const cacheUrl = `/data/${fileName}`;
    const cachedResponse = await cache.match(cacheUrl);

    if (!cachedResponse) {
      return true;
    }

    // Get the cached date from the response headers
    const cachedDate = cachedResponse.headers.get("date");
    if (!cachedDate) {
      return true;
    }

    try {
      // Get current metadata from Firebase Storage
      const metadata = await getFileMetadata(fileName);
      const firebaseLastModified = new Date(metadata.lastModified);
      const cachedDateObj = new Date(cachedDate);

      const isStale = firebaseLastModified > cachedDateObj;

      return isStale;
    } catch (metadataError) {
      console.error(
        `[App] isCacheStale: Error getting metadata for ${fileName}:`,
        metadataError
      );
      // If we can't get metadata, assume cache is fresh to avoid unnecessary refetches
      return false;
    }
  } catch (error) {
    console.error(
      `[App] isCacheStale: Error checking if cache is stale for ${fileName}:`,
      error
    );
    // If we can't check, assume it's stale to be safe
    return true;
  }
}

/**
 * Checks if a file exists in cache and is not stale
 * @param {string} fileName - The name of the file to check
 * @returns {Promise<Object|null>} The parsed data from cache if found and fresh, null otherwise
 */
export async function checkFileInCacheWithMetadata(fileName) {
  try {
    // Check if Cache API is available (not available in all contexts)
    if (typeof caches === 'undefined') {
      return null;
    }
    
    const cache = await caches.open(STATIC_DATA_CACHE);
    const cacheUrl = `/data/${fileName}`;
    const cachedResponse = await cache.match(cacheUrl);

    if (!cachedResponse) {
      return null;
    }

    // Check if cache is stale
    const isStale = await isCacheStale(fileName);
    if (isStale) {
      return null;
    }

    const text = await cachedResponse.text();
    return JSON.parse(text);
  } catch (error) {
    console.error(
      `[App] checkFileInCacheWithMetadata: Error checking cache for ${fileName}:`,
      error
    );
    return null;
  }
}

/**
 * Gets data from the cache
 * @param {string} fileName - The name of the file to get (e.g., 'searchIndex_compressed.json.gz')
 * @returns {Promise<Object>} The parsed JSON data
 */
export async function getCachedData(fileName) {
  try {
    const url = `/data/${fileName}`;

    // Check if Cache API is available (not available in all contexts)
    if (typeof caches === 'undefined') {
      // If no cache API, fetch directly from storage
      return await getDataFileFromStorage(fileName);
    }

    const cache = await caches.open(STATIC_DATA_CACHE);
    const cachedResponse = await cache.match(url);

    if (!cachedResponse) {
      return await getDataFileFromStorage(fileName);
    }

    const response = cachedResponse.clone();
    const data = await response.json();

    return data;
  } catch (error) {
    console.error(`Error getting ${fileName}:`, error);

    // Only report to Sentry in production
    if (import.meta.env.MODE === "production") {
      Sentry.captureException(error, {
        tags: {
          fileName,
          errorType: "cache_load_failure",
        },
        extra: {
          message: `Failed to load ${fileName} from cache`,
        },
      });
    }

    throw error;
  }
}

// Helper functions for specific data files
export const getSearchIndex = async () => {
  return await getCachedData(CACHED_DATA_FILES.SEARCH_INDEX);
};

export const getFullItemList = async () => {
  return await getCachedData(CACHED_DATA_FILES.FULL_ITEM_LIST);
};

export const getReprocessingData = async () => {
  return await getCachedData(CACHED_DATA_FILES.REPROCESSING_DATA);
};

export const getRecipeListFromCache = async () => {
  return await getCachedData(CACHED_DATA_FILES.RECIPE_LIST);
};

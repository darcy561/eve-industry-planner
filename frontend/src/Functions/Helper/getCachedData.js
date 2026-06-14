import {
  STATIC_DATA_CACHE,
  CACHED_DATA_FILES,
} from "../../Context/defaultValues";
import { captureException } from "@sentry/react";
import { fetchWithPublicHeaders } from "../Endpoints/Public/applyPublicHeaders.js";
import { sentryIsDevelopmentEnvironment } from "../Sentry/sentryEnvironment";

const STATIC_DATA_META_URL = "/api/static-data/meta";
const LEGACY_STATIC_CACHE_PREFIX = "static-data-cache-";
let cacheMigrationDone = false;

let staticMetaCache = null;
let staticMetaFetchedAt = 0;
let staticMetaInFlight = null;
const STATIC_META_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function fetchStaticMeta(force = false, allowNetwork = true) {
  const now = Date.now();
  if (!force && staticMetaCache && now - staticMetaFetchedAt < STATIC_META_TTL_MS) {
    return staticMetaCache;
  }
  if (!allowNetwork) {
    return staticMetaCache;
  }

  // Deduplicate concurrent callers so we don't spam /api/static-data/meta.
  if (!force && staticMetaInFlight) {
    return staticMetaInFlight;
  }

  staticMetaInFlight = (async () => {
    const response = await fetchWithPublicHeaders(
      STATIC_DATA_META_URL,
      {
        method: "GET",
        headers: { Accept: "application/json" },
      },
      { requestName: "staticDataMeta" }
    );
    if (!response.ok) {
      throw new Error(`Failed to fetch static data metadata: ${response.status} ${response.statusText}`);
    }

    staticMetaCache = await response.json();
    staticMetaFetchedAt = Date.now();
    return staticMetaCache;
  })();

  try {
    return await staticMetaInFlight;
  } catch (error) {
    // If we already have metadata, prefer stale metadata over hard failure.
    if (staticMetaCache) {
      return staticMetaCache;
    }
    throw error;
  } finally {
    staticMetaInFlight = null;
  }
}

async function getMetaForRead() {
  // Fast path for normal read calls: no network if we already have metadata.
  const cached = await fetchStaticMeta(false, false);
  if (cached) return cached;

  // Cold start fallback: fetch once.
  return fetchStaticMeta(false, true);
}

/** Resolves the active SDE build number from cached static-data metadata. */
export async function getStaticDataBuildVersion() {
  const meta = await getMetaForRead();
  if (!meta) return null;
  if (meta.build_number > 0) return String(meta.build_number);
  if (meta.build_version) return meta.build_version;
  return null;
}

function getVersionedURLFromMeta(meta, fileKey) {
  const fileMeta = meta?.file_keys?.[fileKey];
  if (!fileMeta) {
    throw new Error(`Static data metadata missing file key: ${fileKey}`);
  }
  return fileMeta.versioned_url || fileMeta.url;
}

async function getCache() {
  if (typeof caches === "undefined") {
    return null;
  }
  try {
    return await caches.open(STATIC_DATA_CACHE);
  } catch (error) {
    // Firefox Mobile (strict privacy / some contexts): `caches` exists but
    // `open()` throws SecurityError (DOMException 18) — fall back to network-only loads.
    const isSecurity =
      error?.name === "SecurityError" || error?.code === 18;
    if (isSecurity) {
      console.warn(
        "[App] Cache API blocked (SecurityError); static data will load over the network.",
        error
      );
      return null;
    }
    throw error;
  }
}

async function migrateAndCleanupStaticCaches() {
  if (cacheMigrationDone || typeof caches === "undefined") {
    return;
  }
  cacheMigrationDone = true;

  try {
    const cacheNames = await caches.keys();

    // Remove old static-data cache versions.
    await Promise.all(
      cacheNames
        .filter((name) => name.startsWith(LEGACY_STATIC_CACHE_PREFIX) && name !== STATIC_DATA_CACHE)
        .map((name) => caches.delete(name))
    );
  } catch (error) {
    console.warn("[App] static cache migration cleanup failed:", error);
  }
}

async function parseJSONResponse(response) {
  const text = await response.text();
  return JSON.parse(text);
}

async function fetchAndCacheByURL(cache, cacheURL) {
  const response = await fetchWithPublicHeaders(
    cacheURL,
    {
      method: "GET",
      headers: { Accept: "application/json" },
    },
    { requestName: "staticDataFile" }
  );
  if (!response.ok) {
    throw new Error(`Failed to fetch ${cacheURL}: ${response.status} ${response.statusText}`);
  }

  const cloned = response.clone();
  if (cache) {
    await cache.put(cacheURL, cloned);
  }
  return parseJSONResponse(response);
}

function getCurrentStaticURLsFromMeta(meta) {
  const keys = Object.keys(meta?.file_keys || {});
  const urls = new Set();
  for (const key of keys) {
    const fileMeta = meta.file_keys[key];
    const url = fileMeta?.versioned_url || fileMeta?.url;
    if (url) {
      urls.add(url);
    }
  }
  return urls;
}

function isStaticDataRequestURL(requestURL) {
  try {
    const parsed = new URL(requestURL, window.location.origin);
    return parsed.pathname.startsWith("/api/static-data/") && parsed.pathname !== "/api/static-data/meta";
  } catch {
    return false;
  }
}

async function pruneStaleStaticCacheEntries(cache, meta) {
  if (!cache) return;

  const validURLs = getCurrentStaticURLsFromMeta(meta);
  if (validURLs.size === 0) return;

  const requests = await cache.keys();
  await Promise.all(
    requests.map(async (req) => {
      if (!isStaticDataRequestURL(req.url)) return;

      // Normalize to path+query so it matches meta URLs.
      const parsed = new URL(req.url, window.location.origin);
      const normalized = `${parsed.pathname}${parsed.search}`;
      if (!validURLs.has(normalized)) {
        await cache.delete(req);
      }
    })
  );
}

/**
 * Checks if a file exists in the cache and returns the data if found
 * @param {string} fileName - The name of the file to check
 * @returns {Promise<Object|null>} The parsed data from cache if found, null otherwise
 */
export async function checkFileInCache(fileName) {
  try {
    const meta = await getMetaForRead();
    if (!meta) return null;
    const cacheURL = getVersionedURLFromMeta(meta, fileName);
    const cache = await getCache();
    if (!cache) {
      return null;
    }

    const cachedResponse = await cache.match(cacheURL);

    if (cachedResponse) {
      return parseJSONResponse(cachedResponse);
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
 * Checks if a file exists in cache and is not stale
 * @param {string} fileName - The name of the file to check
 * @returns {Promise<Object|null>} The parsed data from cache if found and fresh, null otherwise
 */
export async function checkFileInCacheWithMetadata(fileName) {
  try {
    const meta = await getMetaForRead();
    if (!meta) return null;
    const cacheURL = getVersionedURLFromMeta(meta, fileName);
    const cache = await getCache();
    if (!cache) {
      return null;
    }

    const cachedResponse = await cache.match(cacheURL);

    if (!cachedResponse) {
      return null;
    }
    return parseJSONResponse(cachedResponse);
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
    const meta = await getMetaForRead();
    if (!meta) {
      throw new Error("Static metadata unavailable");
    }
    const cacheURL = getVersionedURLFromMeta(meta, fileName);
    const cache = await getCache();
    if (!cache) {
      return fetchAndCacheByURL(null, cacheURL);
    }

    const cachedResponse = await cache.match(cacheURL);
    if (!cachedResponse) {
      return fetchAndCacheByURL(cache, cacheURL);
    }

    return parseJSONResponse(cachedResponse);
  } catch (error) {
    console.error(`Error getting ${fileName}:`, error);

    // Match Sentry `beforeSend`: skip cache errors in development only
    if (!sentryIsDevelopmentEnvironment()) {
      captureException(error, {
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

export async function preloadAllStaticDataFromAPI() {
  const meta = await fetchStaticMeta(false, true);
  const cache = await getCache();
  await pruneStaleStaticCacheEntries(cache, meta);
  const fileKeys = Object.keys(meta?.file_keys || {});
  const results = {};

  for (const fileKey of fileKeys) {
    const cacheURL = getVersionedURLFromMeta(meta, fileKey);
    try {
      if (cache) {
        const cached = await cache.match(cacheURL);
        if (cached) {
          results[fileKey] = { data: await parseJSONResponse(cached) };
          continue;
        }
      }
      const data = await fetchAndCacheByURL(cache, cacheURL);
      results[fileKey] = { data };
    } catch (error) {
      results[fileKey] = { error: error.message };
    }
  }
  return results;
}

// Refreshes metadata from API and prunes/fetches static files.
// Intended for app startup and periodic refreshes, not per-file reads.
export async function refreshStaticDataCache() {
  await migrateAndCleanupStaticCaches();
  const meta = await fetchStaticMeta(true, true);
  const cache = await getCache();
  await pruneStaleStaticCacheEntries(cache, meta);
  return preloadAllStaticDataFromAPI();
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

import {
  getStorage,
  ref,
  getDownloadURL,
  getMetadata,
  getBytes,
} from "firebase/storage";
import { getToken } from "firebase/app-check";
import { appCheck } from "../../firebase";
import {
  CACHED_DATA_FILES,
  STATIC_DATA_CACHE,
} from "../../Context/defaultValues";
import { gunzipSync } from "fflate";

// Initialize Firebase Storage
const storage = getStorage();

/**
 * Gets the metadata for a file from Firebase Storage
 * @param {string} fileName - The name of the file to get metadata for
 * @returns {Promise<Object>} The metadata object containing lastModified and other properties
 */
export async function getFileMetadata(fileName) {
  try {
    if (!fileName) {
      throw new Error("File name is required");
    }

    // Get App Check token
    const appCheckToken = await getToken(appCheck);

    // Use Firebase Storage SDK (App Check is handled automatically by the SDK)
    const fileRef = ref(storage, `data/${fileName}`);

    try {
      // Get metadata using Firebase SDK
      const metadata = await getMetadata(fileRef);

      return {
        lastModified: metadata.updated,
        size: metadata.size,
        contentType: metadata.contentType,
        name: metadata.name,
      };
    } catch (error) {
      console.error(
        `[App] getFileMetadata: Error getting metadata for ${fileName}:`,
        error.message
      );
      throw error;
    }
  } catch (error) {
    console.error(
      `Error getting metadata for file ${fileName} from Firebase Storage:`,
      error
    );
    throw error;
  }
}

/**
 * Retrieves a data file from Firebase Storage using App Check token
 * @param {string} fileName - The name of the file to retrieve (e.g., 'searchIndex_compressed.json.gz')
 * @returns {Promise<Object>} The parsed data from the file
 */
export async function getDataFileFromStorage(fileName) {
  try {
    if (!fileName) {
      throw new Error("File name is required");
    }

    // Get App Check token
    const appCheckToken = await getToken(appCheck);

    // Use Firebase Storage SDK (App Check is handled automatically by the SDK)
    const fileRef = ref(storage, `data/${fileName}`);

    try {
      // Try to get the download URL using Firebase SDK (this should work with App Check)
      const downloadURL = await getDownloadURL(fileRef);

      // Fetch the file directly with proper CORS headers
      const response = await fetch(downloadURL);

      if (!response.ok) {
        throw new Error(
          `Failed to fetch ${fileName}: ${response.status} ${response.statusText}`
        );
      }

      // Handle GZIP compressed files
      if (fileName.endsWith(".gz")) {
        // For GZIP files, we need to decompress them using fflate
        const arrayBuffer = await response.arrayBuffer();
        const compressedData = new Uint8Array(arrayBuffer);

        // Decompress using fflate
        const decompressedData = gunzipSync(compressedData);

        // Store the decompressed data in cache
        const cache = await caches.open(STATIC_DATA_CACHE);
        const cacheUrl = `/data/${fileName}`;
        const cacheResponse = new Response(decompressedData, {
          headers: {
            "Content-Type": "application/json",
            "Content-Encoding": "identity",
            date: new Date().toISOString(),
          },
        });

        await cache.put(cacheUrl, cacheResponse);

        // Convert to text and parse JSON
        const text = new TextDecoder().decode(decompressedData);
        const data = JSON.parse(text);
        return data;
      } else {
        // For non-GZIP files, store in cache and parse JSON
        const text = await response.text();

        const cache = await caches.open(STATIC_DATA_CACHE);
        const cacheUrl = `/data/${fileName}`;
        const cacheResponse = new Response(text, {
          headers: {
            "Content-Type": "application/json",
            date: new Date().toISOString(),
          },
        });

        await cache.put(cacheUrl, cacheResponse);

        const data = JSON.parse(text);
        return data;
      }
    } catch (error) {
      console.error(
        `[App] getDataFileFromStorage: Error with Firebase SDK for ${fileName}:`,
        error.message
      );

      // If it's a CORS or network error, try without App Check token
      if (
        error.message.includes("CORS") ||
        error.message.includes("network") ||
        error.message.includes("fetch")
      ) {
        console.log(
          `[App] getDataFileFromStorage: Retrying ${fileName} without App Check token`
        );
        try {
          // Try without App Check token
          const downloadURL = await getDownloadURL(fileRef);
          const response = await fetch(downloadURL, {
            method: "GET",
            mode: "cors",
            credentials: "omit",
            headers: {
              Accept: "application/json, application/gzip, */*",
              "Cache-Control": "no-cache",
            },
          });

          if (!response.ok) {
            throw new Error(
              `Failed to fetch ${fileName}: ${response.status} ${response.statusText}`
            );
          }

          // Handle GZIP compressed files
          if (fileName.endsWith(".gz")) {
            const arrayBuffer = await response.arrayBuffer();
            const compressedData = new Uint8Array(arrayBuffer);
            const decompressedData = gunzipSync(compressedData);

            const cache = await caches.open(STATIC_DATA_CACHE);
            const cacheUrl = `/data/${fileName}`;
            const cacheResponse = new Response(decompressedData, {
              headers: {
                "Content-Type": "application/json",
                "Content-Encoding": "identity",
                date: new Date().toISOString(),
              },
            });

            await cache.put(cacheUrl, cacheResponse);

            const text = new TextDecoder().decode(decompressedData);
            const data = JSON.parse(text);
            return data;
          } else {
            const text = await response.text();
            const cache = await caches.open(STATIC_DATA_CACHE);
            const cacheUrl = `/data/${fileName}`;
            const cacheResponse = new Response(text, {
              headers: {
                "Content-Type": "application/json",
                date: new Date().toISOString(),
              },
            });

            await cache.put(cacheUrl, cacheResponse);
            const data = JSON.parse(text);
            return data;
          }
        } catch (retryError) {
          console.error(
            `[App] getDataFileFromStorage: Retry also failed for ${fileName}:`,
            retryError.message
          );
          throw retryError;
        }
      }

      throw error;
    }
  } catch (error) {
    console.error(
      `Error retrieving file ${fileName} from Firebase Storage:`,
      error
    );
    throw error;
  }
}

/**
 * Retrieves multiple data files from Firebase Storage
 * @param {string[]} fileNames - Array of file names to retrieve
 * @returns {Promise<Object>} Object with file names as keys and parsed data as values
 */
export async function getMultipleDataFilesFromStorage(fileNames) {
  try {
    if (!Array.isArray(fileNames) || fileNames.length === 0) {
      throw new Error("File names array is required and cannot be empty");
    }

    const results = {};

    // Get all files in parallel
    const promises = fileNames.map(async (fileName) => {
      try {
        const data = await getDataFileFromStorage(fileName);
        return { fileName, data };
      } catch (error) {
        console.error(`Failed to get file ${fileName}:`, error);
        return { fileName, error: error.message };
      }
    });

    const responses = await Promise.all(promises);

    // Process results
    responses.forEach(({ fileName, data, error }) => {
      if (error) {
        results[fileName] = { error };
      } else {
        results[fileName] = { data };
      }
    });

    return results;
  } catch (error) {
    console.error(
      "Error retrieving multiple files from Firebase Storage:",
      error
    );
    throw error;
  }
}

/**
 * Retrieves all cached data files from Firebase Storage
 * @returns {Promise<Object>} Object with file names as keys and parsed data as values
 */
export async function getAllCachedDataFilesFromStorage() {
  try {
    const fileNames = Object.values(CACHED_DATA_FILES);
    return await getMultipleDataFilesFromStorage(fileNames);
  } catch (error) {
    console.error(
      "Error retrieving all cached data files from Firebase Storage:",
      error
    );
    throw error;
  }
}


import { useEffect } from "react";
import { getAllCachedDataFilesFromStorage } from "../Functions/Firebase/getDataFilesFromStorage";
import { checkFileInCacheWithMetadata } from "../Functions/Helper/getCachedData";
import { CACHED_DATA_FILES } from "../Context/defaultValues";

/**
 * Custom hook that fetches static data files required by the application
 * 
 * This hook:
 * - Checks cache first for all required static data files with metadata validation
 * - If all files are cached and valid, returns cached data
 * - If any files are missing or invalid, fetches all files from Firebase Storage
 * - Runs only once on component mount (empty dependency array)
 * - Handles errors gracefully with console logging
 * 
 * The hook fetches files defined in CACHED_DATA_FILES including:
 * - Search index data
 * - Full item list
 * - Reprocessing data
 * - Recipe lists
 * 
 * @returns {void} This hook doesn't return any value, but fetches and caches data files
 * 
 * @example
 * function App() {
 *   useFetchStaticDataFiles(); // Fetches all static data files on app start
 *   return <div>App content</div>;
 * }
 */
export default function useFetchStaticDataFiles() {
    useEffect(() => {
        const fetchStaticDataFiles = async () => {
            try {
                // Check cache first for all files (with metadata validation)
                const fileNames = Object.values(CACHED_DATA_FILES);
                const cacheResults = {};
                let allFilesInCache = true;
                
                for (const fileName of fileNames) {
                    const cachedData = await checkFileInCacheWithMetadata(fileName);
                    if (cachedData) {
                        cacheResults[fileName] = { data: cachedData };
                    } else {
                        allFilesInCache = false;
                    }
                }
                
                if (allFilesInCache) {
                    return cacheResults;
                } else {
                    return await getAllCachedDataFilesFromStorage();
                }
            } catch (err) {
                console.error("[App] useFetchStaticDataFiles: Error fetching static data files:", err);
            }
        };

        fetchStaticDataFiles();
    }, []); // Empty dependency array ensures this runs only on first render
}
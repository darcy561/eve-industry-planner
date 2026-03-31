
import { useEffect } from "react";
import {
    refreshStaticDataCache,
} from "../Functions/Helper/getCachedData";

const STATIC_DATA_REFRESH_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Custom hook that fetches static data files required by the application
 * 
 * This hook:
 * - Uses the static-data meta endpoint to discover available files
 * - Preloads all advertised files into cache via versioned URLs
 * - Runs only once on component mount (empty dependency array)
 * - Handles errors gracefully with console logging
 * 
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
                await refreshStaticDataCache();
            } catch (err) {
                console.error("[App] useFetchStaticDataFiles: Error fetching static data files:", err);
            }
        };

        fetchStaticDataFiles();
        const intervalId = setInterval(fetchStaticDataFiles, STATIC_DATA_REFRESH_INTERVAL_MS);

        return () => {
            clearInterval(intervalId);
        };
    }, []); // Empty dependency array ensures this runs only on first render
}
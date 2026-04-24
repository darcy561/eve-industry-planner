import { useEffect } from "react";
import { refreshStaticDataCache } from "../../Functions/Helper/getCachedData";

const STATIC_DATA_REFRESH_INTERVAL_MS = 30 * 60 * 1000;

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
  }, []);
}

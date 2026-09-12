import { useEffect } from "react";
import { refreshStaticDataCache } from "../../Functions/Helper/getCachedData";
import { primeMarketGroupData } from "../../Functions/MarketData/marketGroupData";

const STATIC_DATA_REFRESH_INTERVAL_MS = 30 * 60 * 1000;

export default function useFetchStaticDataFiles() {
  useEffect(() => {
    const fetchStaticDataFiles = async () => {
      try {
        await refreshStaticDataCache();
        // Material pricing walks the market group tree while building a row, so
        // it needs these two readable without awaiting.
        await primeMarketGroupData();
      } catch (err) {
        console.error(
          "[App] useFetchStaticDataFiles: Error fetching static data files:",
          err,
        );
      }
    };

    fetchStaticDataFiles();
    const intervalId = setInterval(
      fetchStaticDataFiles,
      STATIC_DATA_REFRESH_INTERVAL_MS,
    );
    return () => {
      clearInterval(intervalId);
    };
  }, []);
}

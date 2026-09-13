import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { refreshStaticDataCache } from "../../Functions/Helper/getCachedData";
import {
  primeMarketGroupData,
  resetMarketGroupData,
} from "../../Functions/MarketData/marketGroupData";

const STATIC_DATA_REFRESH_INTERVAL_MS = 30 * 60 * 1000;

export default function useFetchStaticDataFiles() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const fetchStaticDataFiles = async () => {
      try {
        const { changed } = await refreshStaticDataCache();

        // A new SDE build is a different file behind every key, and everything holding the old
        // one has to let go of it: the query entries a view is subscribed to, and the copies
        // primed for the callers that read without awaiting. An unchanged build is nothing to
        // drop — the copies held are already that build's.
        if (changed) {
          // resetMarketGroupData drops the item half too, so the tree and the records it reads
          // groups from are never left from different builds.
          resetMarketGroupData();
          queryClient.invalidateQueries({ queryKey: ["static"] });
        }

        // Material pricing walks the market group tree while building a row, so
        // it needs these readable without awaiting.
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
  }, [queryClient]);
}

import { useEffect } from "react";
import useUsersStore from "../../Zustand/usersStore.js";
import GLOBAL_CONFIG from "../../global-config-app";

const { DEFAULT_MARKET_OPTION, DEFAULT_ORDER_OPTION } = GLOBAL_CONFIG;

export function useStripRedundantJobMarketHubOverrides(activeJob, updateActiveJob) {
  const defaultMarketLocation = useUsersStore(
    (s) => s.applicationSettings.defaultMarketLocation
  );
  const defaultOrderType = useUsersStore(
    (s) => s.applicationSettings.defaultOrderType
  );

  useEffect(() => {
    if (!activeJob?.layout) return;

    const canonMarket = defaultMarketLocation ?? DEFAULT_MARKET_OPTION;
    const canonOrder = defaultOrderType ?? DEFAULT_ORDER_OPTION;

    const layout = activeJob.layout;
    let changed = false;

    if (
      layout.localMarketDisplay != null &&
      layout.localMarketDisplay === canonMarket
    ) {
      layout.localMarketDisplay = null;
      changed = true;
    }
    if (
      layout.localOrderDisplay != null &&
      layout.localOrderDisplay === canonOrder
    ) {
      layout.localOrderDisplay = null;
      changed = true;
    }

    if (changed) {
      updateActiveJob(activeJob);
    }
  }, [
    activeJob,
    activeJob?.layout?.localMarketDisplay,
    activeJob?.layout?.localOrderDisplay,
    defaultMarketLocation,
    defaultOrderType,
    updateActiveJob,
  ]);
}

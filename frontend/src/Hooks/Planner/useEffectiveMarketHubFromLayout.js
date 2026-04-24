import { useMemo } from "react";
import useUsersStore from "../../Zustand/usersStore.js";
import GLOBAL_CONFIG from "../../global-config-app";

const { DEFAULT_MARKET_OPTION, DEFAULT_ORDER_OPTION } = GLOBAL_CONFIG;

export function useEffectiveMarketHubFromLayout(layout) {
  const defaultMarketLocation = useUsersStore(
    (s) => s.applicationSettings.defaultMarketLocation
  );
  const defaultOrderType = useUsersStore(
    (s) => s.applicationSettings.defaultOrderType
  );

  return useMemo(
    () => ({
      marketDisplay:
        layout.localMarketDisplay ??
        defaultMarketLocation ??
        DEFAULT_MARKET_OPTION,
      orderDisplay:
        layout.localOrderDisplay ??
        defaultOrderType ??
        DEFAULT_ORDER_OPTION,
    }),
    [
      layout.localMarketDisplay,
      layout.localOrderDisplay,
      defaultMarketLocation,
      defaultOrderType,
    ]
  );
}

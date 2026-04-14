import { useEffect, useState } from "react";
import {
  DEFAULT_APP_CONFIG,
  getAppConfig,
  refreshAppConfig,
  subscribeToAppConfig,
} from "../../Functions/Endpoints/Public/appConfig.js";

function useAppConfig({ enableAutoRefresh = false, refreshIntervalMs = 0 } = {}) {
  const [config, setConfig] = useState(
    () => getAppConfig() || DEFAULT_APP_CONFIG
  );

  useEffect(() => {
    const unsubscribe = subscribeToAppConfig(setConfig);
    refreshAppConfig();
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!enableAutoRefresh || refreshIntervalMs <= 0) {
      return undefined;
    }

    const interval = setInterval(() => {
      refreshAppConfig();
    }, refreshIntervalMs);

    return () => clearInterval(interval);
  }, [enableAutoRefresh, refreshIntervalMs]);

  return config;
}

export default useAppConfig;

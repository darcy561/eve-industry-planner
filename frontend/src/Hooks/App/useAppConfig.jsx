import { useEffect, useState } from "react";
import { showVersionUpdateSnackbar } from "../../Events/snackbarEvents";
import GLOBAL_CONFIG from "../../global-config-app";
import {
  DEFAULT_APP_CONFIG,
  getAppConfig,
  getAppVersionNumber,
  getLastAppConfigFetchMeta,
  refreshAppConfig,
  subscribeToAppConfig,
} from "../../Functions/Endpoints/Public/appConfig.js";

const { DEFAULT_APP_VERSION_CHECK_INTERVAL } = GLOBAL_CONFIG;
const VERSION_UPDATE_NOTIFIED_KEY = "app_config_version_update_notified";
const VERSION_UPDATE_DISMISSED_KEY = "app_config_version_update_dismissed";

function getStoredVersion(key) {
  try {
    return window.sessionStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

function setStoredVersion(key, value) {
  try {
    if (!value) {
      window.sessionStorage.removeItem(key);
      return;
    }
    window.sessionStorage.setItem(key, value);
  } catch {
    // Ignore storage errors (private mode, blocked storage, etc.).
  }
}

async function checkForVersionUpdate() {
  try {
    await refreshAppConfig();
    const fetchMeta = getLastAppConfigFetchMeta();
    if (fetchMeta.notModified) {
      return;
    }
    const remoteVersion = getAppVersionNumber();
    const currentVersion = __APP_VERSION__;

    if (!remoteVersion || remoteVersion === currentVersion) {
      setStoredVersion(VERSION_UPDATE_NOTIFIED_KEY, "");
      setStoredVersion(VERSION_UPDATE_DISMISSED_KEY, "");
      return;
    }

    const dismissedVersion = getStoredVersion(VERSION_UPDATE_DISMISSED_KEY);
    if (dismissedVersion === remoteVersion) {
      return;
    }

    const notifiedVersion = getStoredVersion(VERSION_UPDATE_NOTIFIED_KEY);
    if (notifiedVersion !== remoteVersion) {
      setStoredVersion(VERSION_UPDATE_NOTIFIED_KEY, remoteVersion);
      showVersionUpdateSnackbar(remoteVersion, (dismissedTargetVersion) => {
        if (!dismissedTargetVersion) {
          return;
        }
        setStoredVersion(VERSION_UPDATE_DISMISSED_KEY, dismissedTargetVersion);
      });
    }
  } catch (error) {
    console.error("Error checking app version:", error);
  }
}

/**
 * Subscribes to the shared in-memory app config. Set `shouldFetchOnMount: true` only
 * in `App.jsx` so the initial fetch and optional timers run once; other callers only
 * subscribe and avoid a network call on every route / menu mount.
 */
function useAppConfig({
  enableAutoRefresh = false,
  refreshIntervalMs = 0,
  enableVersionCheck = false,
  versionCheckIntervalMs = DEFAULT_APP_VERSION_CHECK_INTERVAL * 60 * 1000,
  shouldFetchOnMount = false,
} = {}) {
  const [config, setConfig] = useState(
    () => getAppConfig() || DEFAULT_APP_CONFIG
  );

  useEffect(() => {
    const unsubscribe = subscribeToAppConfig(setConfig);
    if (shouldFetchOnMount) {
      void refreshAppConfig();
    }
    return unsubscribe;
  }, [shouldFetchOnMount]);

  useEffect(() => {
    if (!shouldFetchOnMount || !enableAutoRefresh || refreshIntervalMs <= 0) {
      return undefined;
    }

    const interval = setInterval(() => {
      void refreshAppConfig();
    }, refreshIntervalMs);

    return () => clearInterval(interval);
  }, [shouldFetchOnMount, enableAutoRefresh, refreshIntervalMs]);

  useEffect(() => {
    if (!shouldFetchOnMount || !enableVersionCheck || versionCheckIntervalMs <= 0) {
      return undefined;
    }

    void checkForVersionUpdate();
    const interval = setInterval(() => {
      void checkForVersionUpdate();
    }, versionCheckIntervalMs);

    return () => clearInterval(interval);
  }, [shouldFetchOnMount, enableVersionCheck, versionCheckIntervalMs]);

  return config;
}

export default useAppConfig;

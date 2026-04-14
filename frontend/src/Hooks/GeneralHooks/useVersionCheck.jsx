import { useEffect, useRef } from "react";
import { showVersionUpdateSnackbar } from "../../Events/snackbarEvents";
import GLOBAL_CONFIG from "../../global-config-app";
import {
  getAppVersionNumber,
  getLastAppConfigFetchMeta,
  refreshAppConfig,
} from "../../Functions/Endpoints/Public/appConfig.js";
const { DEFAULT_APP_VERSION_CHECK_INTERVAL } = GLOBAL_CONFIG;
const VERSION_UPDATE_NOTIFIED_KEY = "app_config_version_update_notified";
const VERSION_UPDATE_DISMISSED_KEY = "app_config_version_update_dismissed";

/**
 * Custom hook that monitors app version updates and notifies users when updates are available.
 * 
 * This hook:
 * - Checks for app version updates at regular intervals
 * - Compares current app version with remote configuration version
 * - Shows update notification snackbar when new version is available
 * - Prevents duplicate notifications using a ref flag
 * - Cleans up intervals on component unmount
 * 
 * The hook fetches backend app config to read the latest app version
 * and compares it with the current build version (__APP_VERSION__).
 * 
 * @returns {Object} Object containing version check functions
 * @returns {Function} returns.checkForVersionUpdate - Manually trigger version check
 * 
 * @example
 * function App() {
 *   const { checkForVersionUpdate } = useVersionCheck();
 *   
 *   return (
 *     <div>
 *       <button onClick={checkForVersionUpdate}>Check for Updates</button>
 *       <div>App content</div>
 *     </div>
 *   );
 * }
 */
function useVersionCheck() {
  const checkInterval = useRef(null);

  const getStoredVersion = (key) => {
    try {
      return window.sessionStorage.getItem(key) || "";
    } catch {
      return "";
    }
  };

  const setStoredVersion = (key, value) => {
    try {
      if (!value) {
        window.sessionStorage.removeItem(key);
        return;
      }
      window.sessionStorage.setItem(key, value);
    } catch {
      // Ignore storage errors (private mode, blocked storage, etc.).
    }
  };

  useEffect(() => {
    checkForVersionUpdate();

    checkInterval.current = setInterval(
      checkForVersionUpdate,
      DEFAULT_APP_VERSION_CHECK_INTERVAL * 60 * 1000
    );

    return () => {
      if (checkInterval.current) {
        clearInterval(checkInterval.current);
      }
    };
  }, []);

  const checkForVersionUpdate = async () => {
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
  };

  return {
    checkForVersionUpdate,
  };
}

export default useVersionCheck;

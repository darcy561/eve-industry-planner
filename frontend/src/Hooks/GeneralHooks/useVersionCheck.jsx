import { useEffect, useRef } from "react";
import { fetchAndActivate, getString } from "firebase/remote-config";
import { remoteConfig } from "../../firebase";
import { showVersionUpdateSnackbar } from "../../Events/snackbarEvents";
import GLOBAL_CONFIG from "../../global-config-app";
const { DEFAULT_APP_VERSION_CHECK_INTERVAL } = GLOBAL_CONFIG;

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
 * The hook uses Firebase Remote Config to fetch the latest app version
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
    const hasShownUpdateNotification = useRef(false);
    const checkInterval = useRef(null);

    useEffect(() => {
        checkForVersionUpdate();

        checkInterval.current = setInterval(checkForVersionUpdate, DEFAULT_APP_VERSION_CHECK_INTERVAL * 60 * 1000);

        return () => {
            if (checkInterval.current) {
                clearInterval(checkInterval.current);
            }
        };
    }, []);

    const checkForVersionUpdate = async () => {
        try {
            // Wait for fetchAndActivate to complete and ensure the config is activated
            const activated = await fetchAndActivate(remoteConfig);
            
            // Only proceed if the config was actually activated (new data was fetched)
            if (activated) {
                const remoteVersion = getString(remoteConfig, "app_version_number");
                const currentVersion = __APP_VERSION__;

                if (remoteVersion && remoteVersion !== currentVersion && !hasShownUpdateNotification.current) {
                    hasShownUpdateNotification.current = true;
                    showVersionUpdateSnackbar();
                }
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

import { useEffect } from "react";
import GLOBAL_CONFIG from "../global-config-app";
import useUsersStore from "../Zustand/usersStore";

/**
 * Custom hook that automatically refreshes ESI (EVE Online API) OAuth tokens for all logged-in users
 * at regular intervals to maintain valid authentication. ESI routes are documented in CCP’s OpenAPI-based
 * API Explorer: https://developers.eveonline.com/api-explorer
 *
 * This hook:
 * - Delegates to `account.actions.runScheduledTokenRefresh` on an interval
 * - Runs at intervals defined by GLOBAL_CONFIG.DEFAULT_CHARACTER_REFRESH_INTERVAL
 *
 * @returns {void} This hook doesn't return any value, but sets up an interval for token refresh
 *
 * @example
 * // Use in a component to automatically refresh ESI tokens
 * function MyComponent() {
 *   useRefreshESITokens();
 *   return <div>Component content</div>;
 * }
 */
function useRefreshESITokens() {
  useEffect(() => {
    const interval = setInterval(
      () =>
        useUsersStore.getState().account.actions.runScheduledTokenRefresh(),
      GLOBAL_CONFIG.DEFAULT_CHARACTER_REFRESH_INTERVAL * 60 * 1000
    );

    return () => clearInterval(interval);
  }, []);
}

export default useRefreshESITokens;

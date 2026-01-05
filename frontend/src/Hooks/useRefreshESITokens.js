import { useEffect } from "react";
import GLOBAL_CONFIG from "../global-config-app";
import useUsersStore from "../Zustand/usersStore";

/**
 * Custom hook that automatically refreshes ESI (EVE Swagger Interface) tokens for all logged-in users
 * at regular intervals to maintain valid authentication with EVE Online's API.
 *
 * This hook:
 * - Checks if users are logged in before attempting token refresh
 * - Iterates through all users in the user array
 * - Refreshes access tokens for each valid user
 * - Updates public character data after token refresh
 * - Updates the user array in the store with refreshed data
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
    const refreshESITokens = async () => {
      if (!useUsersStore.getState().users.isLoggedIn) return;
      const userArray = useUsersStore.getState().users.userArray;
      for (let user of userArray) {
        if (!user || typeof user.refreshESIToken !== "function") {
          console.error(
            "Invalid user object or missing refreshESIToken method"
          );
          continue;
        }
        await user.refreshESIToken();
        await user.getPublicCharacterData();
        await user.refreshServerToken();
      }
      useUsersStore.getState().users.actions.updateUserArray([...userArray]);
    };

    const interval = setInterval(
      refreshESITokens,
      GLOBAL_CONFIG.DEFAULT_CHARACTER_REFRESH_INTERVAL * 60 * 1000
    );

    return () => clearInterval(interval);
  }, []);
}

export default useRefreshESITokens;

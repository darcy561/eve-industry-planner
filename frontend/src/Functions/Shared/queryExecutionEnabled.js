import useUsersStore from "../../Zustand/usersStore";
import { isTranquilityOnlineFromCache } from "../../Hooks/React Query/tranquilityServerStatus.js";

/**
 * Get current query-enabled state without React subscriptions.
 * @returns {boolean}
 */
export function isQueryExecutionEnabled() {
  const isLoggedIn = useUsersStore.getState().account.isLoggedIn;
  return isLoggedIn && isTranquilityOnlineFromCache();
}

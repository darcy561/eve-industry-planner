import useUsersStore from "../../Zustand/usersStore";

/**
 * Get current query-enabled state without React subscriptions.
 * @returns {boolean}
 */
export function isQueryExecutionEnabled() {
  const isLoggedIn = useUsersStore.getState().account.isLoggedIn;
  const eveServerStatus = useUsersStore.getState().worldData.eveServerStatus;
  return isLoggedIn && eveServerStatus;
}

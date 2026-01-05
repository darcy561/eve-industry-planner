import useUsersStore from "../Zustand/usersStore";

/**
 * Custom hook that determines if React Query should be enabled
 * based on both user login status and EVE server status
 * @returns {boolean} Whether queries should be enabled
 */
export function useQueryEnabled() {
  const isLoggedIn = useUsersStore((state) => state.users.isLoggedIn);
  const eveServerStatus = useUsersStore((state) => state.worldData.eveServerStatus);
  
  // Only enable queries if user is logged in AND EVE server is online
  return isLoggedIn && eveServerStatus;
}

/**
 * Get the current query enabled state without subscribing to changes
 * Useful for use in query functions that need to check status
 * @returns {boolean} Whether queries should be enabled
 */
export function getQueryEnabled() {
  const isLoggedIn = useUsersStore.getState().users.isLoggedIn;
  const eveServerStatus = useUsersStore.getState().worldData.eveServerStatus;
  
  return isLoggedIn && eveServerStatus;
}

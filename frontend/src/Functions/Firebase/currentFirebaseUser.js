import { auth } from "../../firebase";
import useUsersStore from "../../Zustand/usersStore";

/**
 * Gets the current Firebase user ID or falls back to the logged-in account ID from the store.
 * 
 * @returns {string|null} Firebase user ID or Mongo account id, null if not available
 * 
 * @example
 * const userId = getCurrentFirebaseUser();
 * if (userId) {
 *   console.log("Current user:", userId);
 * }
 */
function getCurrentFirebaseUser() {
  const user = auth.currentUser;
  return (
    user?.uid || useUsersStore.getState().account.actions.getAccountID() || null
  );
}

export default getCurrentFirebaseUser;

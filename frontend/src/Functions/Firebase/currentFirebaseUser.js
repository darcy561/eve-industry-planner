import { auth } from "../../firebase";
import useUsersStore from "../../Zustand/usersStore";

/**
 * Gets the current Firebase user ID or falls back to the parent user's account ID.
 * 
 * @returns {string|null} Firebase user ID or parent user account ID, null if not available
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
    user?.uid ||
    useUsersStore.getState().users.actions.findParentUser().accountID
  );
}

export default getCurrentFirebaseUser;

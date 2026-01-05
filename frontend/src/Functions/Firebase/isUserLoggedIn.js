import { auth } from "../../firebase";

/**
 * Checks if a user is currently logged in to Firebase Auth.
 * 
 * @returns {boolean} True if user is logged in, false otherwise
 * 
 * @example
 * if (isUserLoggedIn()) {
 *   console.log("User is authenticated");
 * } else {
 *   console.log("User needs to log in");
 * }
 */
function isUserLoggedIn() {
  const user = auth.currentUser;
  return user ? true : false;
}
export default isUserLoggedIn;

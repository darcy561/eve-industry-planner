/**
 * Tutorial Display Functions for EVE Industry Planner.
 */

import useUsersStore from "../../../Zustand/usersStore";

/**
 * Determines whether tutorials should be displayed based on user status and preferences.
 *
 * Checks the user's login status and tutorial preferences to determine if
 * tutorials should be shown. Tutorials are displayed for non-logged-in users
 * or logged-in users who haven't disabled tutorials.
 *
 * @returns {boolean} True if tutorials should be displayed, false otherwise
 */
export default function checkDisplayTutorials() {
  const isLoggedIn = useUsersStore.getState().account.isLoggedIn;
  const displayHelpCards =
    useUsersStore.getState().applicationSettings.displayHelpCards;

  return !isLoggedIn || displayHelpCards;
}

/**
 * Determines whether the right drawer should be expanded based on tutorial settings and page requirements.
 *
 * @param {boolean} [pageRequiresDrawerToBeOpen=false] - Whether the current page requires the drawer to be open
 * @returns {boolean} True if the right drawer should be expanded, false otherwise
 */
export function shouldExpandRightDrawer(pageRequiresDrawerToBeOpen = false) {
  const isLoggedIn = useUsersStore.getState().account.isLoggedIn;
  const displayHelpCards =
    useUsersStore.getState().applicationSettings.displayHelpCards;

  if (pageRequiresDrawerToBeOpen) {
    return true;
  }

  if (!isLoggedIn) {
    return true;
  }

  if (displayHelpCards) {
    return true;
  }

  // If logged in and tutorials are disabled, don't expand
  return false;
}

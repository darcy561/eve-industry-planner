/**
 * Tutorial Display Functions for EVE Industry Planner.
 * 
 * Provides utility functions for determining tutorial display behaviour and
 * right drawer expansion based on user login status and tutorial preferences.
 * These functions integrate with the application's tutorial system to provide
 * contextual UI behaviour for new and returning users.
 * 
 * @fileoverview Functions for tutorial display and drawer behaviour management
 * @author EVE Industry Planner Team
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
 * 
 * @example
 * const showTutorials = checkDisplayTutorials();
 * if (showTutorials) {
 *   // Display tutorial components
 *   showTutorialOverlay();
 * }
 * 
 * @example
 * // Use in conditional rendering
 * {checkDisplayTutorials() && <TutorialComponent />}
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
 * Provides intelligent drawer expansion logic that considers page requirements,
 * user login status, and tutorial preferences. This function is used throughout
 * the application to ensure consistent drawer behaviour that respects both
 * user preferences and tutorial requirements.
 * 
 * @param {boolean} [pageRequiresDrawerToBeOpen=false] - Whether the current page requires the drawer to be open
 * @returns {boolean} True if the right drawer should be expanded, false otherwise
 * 
 * @example
 * // Basic usage - respects tutorial settings
 * const shouldExpand = shouldExpandRightDrawer();
 * setDrawerExpanded(shouldExpand);
 * 
 * @example
 * // Page requires drawer to be open
 * const shouldExpand = shouldExpandRightDrawer(true);
 * // Always returns true regardless of tutorial settings
 * 
 * @example
 * // Use in drawer toggle logic
 * const expandDrawer = shouldExpandRightDrawer(pageRequiresDrawer);
 * actions.setExpandRightDrawer(expandDrawer);
 * 
 * @example
 * // Integration with tutorial system
 * const drawerState = shouldExpandRightDrawer(false);
 * if (drawerState) {
 *   showTutorialContent();
 * }
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

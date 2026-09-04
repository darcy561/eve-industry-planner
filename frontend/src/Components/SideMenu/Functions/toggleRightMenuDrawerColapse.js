/**
 * Right Drawer Toggle Function for EVE Industry Planner.
 */

import { shouldExpandRightDrawer } from "../../Tutorials/Functions/checkDisplayTutorials";

/**
 * Toggles the right drawer collapse/expand state based on content ID and tutorial settings.
 *
 * @param {string|null} newContentID - The new content ID to display in the drawer
 * @param {string|null} existingContentID - The current content ID in the drawer
 * @param {Function} updaterFunction - Function to call with the new drawer state
 * @param {boolean} [pageRequiresDrawerToBeOpen=false] - Whether the page requires drawer to be open
 */
export default function toggleRightDrawerColapse(
  newContentID,
  existingContentID,
  updaterFunction,
  pageRequiresDrawerToBeOpen = false
) {
  // If clicking the same content ID, toggle the drawer
  if (newContentID === existingContentID) {
    // If drawer is open, close it
    // If drawer is closed, open it (if tutorials allow)
    const shouldExpand = shouldExpandRightDrawer(pageRequiresDrawerToBeOpen);
    updaterFunction(shouldExpand);
    return;
  }

  // If clicking different content, open drawer (if tutorials allow)
  const shouldExpand = shouldExpandRightDrawer(pageRequiresDrawerToBeOpen);
  updaterFunction(shouldExpand);
}

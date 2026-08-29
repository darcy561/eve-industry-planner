/**
 * Right Drawer Toggle Function for EVE Industry Planner.
 * 
 * Handles the logic for toggling the right drawer collapse/expand state based on
 * content ID changes and tutorial requirements. Provides intelligent drawer
 * management that respects tutorial settings and user interactions.
 * 
 * @fileoverview Function for managing right drawer toggle behaviour
 * @author EVE Industry Planner Team
 */

import { shouldExpandRightDrawer } from "../../Tutorials/Functions/checkDisplayTutorials";

/**
 * Toggles the right drawer collapse/expand state based on content ID and tutorial settings.
 * 
 * Handles the complex logic for determining whether the right drawer should be
 * expanded or collapsed when content changes or when the same content is clicked.
 * Integrates with tutorial system to respect tutorial-driven drawer behaviour.
 * 
 * @param {string|null} newContentID - The new content ID to display in the drawer
 * @param {string|null} existingContentID - The current content ID in the drawer
 * @param {Function} updaterFunction - Function to call with the new drawer state
 * @param {boolean} [pageRequiresDrawerToBeOpen=false] - Whether the page requires drawer to be open
 * 
 * @example
 * // Toggle drawer when clicking same content
 * toggleRightDrawerColapse('job-details', 'job-details', setExpandRightDrawer, false);
 * 
 * @example
 * // Open drawer with new content
 * toggleRightDrawerColapse('blueprint-info', 'job-details', setExpandRightDrawer, true);
 * 
 * @example
 * // Close drawer by clicking same content
 * toggleRightDrawerColapse('job-details', 'job-details', setExpandRightDrawer, false);
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

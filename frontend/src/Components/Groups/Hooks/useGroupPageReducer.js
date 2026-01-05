/**
 * Group Page Reducer Hook for EVE Industry Planner.
 * 
 * Custom React hook that provides state management for the group page component.
 * Uses useReducer with a custom reducer to handle UI state transitions for
 * drawer management, skeleton loading, and item highlighting functionality.
 * 
 * @fileoverview Custom hook for group page state management
 * @author EVE Industry Planner Team
 */

import { useReducer } from "react";
import { groupPageReducer, GROUP_PAGE_ACTION_TYPES } from "./groupPageReducer";
import { shouldExpandRightDrawer } from "../../Tutorials/Functions/checkDisplayTutorials";

/**
 * Custom hook for managing group page state.
 * 
 * Provides a reducer-based state management solution for the group page,
 * including initial state creation based on tutorial settings, action
 * dispatching, and state access. The hook manages UI state including
 * drawer visibility, skeleton loading, and item highlighting.
 * 
 * @returns {Object} Hook return object
 * @returns {Object} returns.state - Current page state
 * @returns {string|null} returns.state.rightDrawerContentID - Content ID for the right drawer
 * @returns {boolean} returns.state.expandRightDrawer - Whether the right drawer should be expanded
 * @returns {number} returns.state.skeletonElementsToDisplay - Number of skeleton elements to show
 * @returns {boolean} returns.state.pageRequiresDrawerToBeOpen - Whether page requires drawer to be open
 * @returns {Set} returns.state.highlightedItems - Set of highlighted item IDs
 * @returns {Object} returns.actions - Action dispatchers
 * @returns {Function} returns.actions.setRightDrawerContentID - Set right drawer content ID
 * @returns {Function} returns.actions.setExpandRightDrawer - Set right drawer expansion state
 * @returns {Function} returns.actions.setSkeletonElementsToDisplay - Set skeleton elements count
 * @returns {Function} returns.actions.setPageRequiresDrawerToBeOpen - Set drawer requirement state
 * @returns {Function} returns.actions.setHighlightedItems - Set highlighted items collection
 * 
 * @example
 * function GroupPage() {
 *   const { state, actions } = useGroupPageReducer();
 *   
 *   const handleOpenDrawer = (contentID) => {
 *     actions.setRightDrawerContentID(contentID);
 *     actions.setExpandRightDrawer(true);
 *   };
 *   
 *   const handleHighlightItems = (itemIDs) => {
 *     actions.setHighlightedItems(new Set(itemIDs));
 *   };
 *   
 *   return (
 *     <div>
 *       Drawer expanded: {state.expandRightDrawer ? 'Yes' : 'No'}
 *       Skeleton elements: {state.skeletonElementsToDisplay}
 *       Highlighted items: {state.highlightedItems.size}
 *     </div>
 *   );
 * }
 */
export default function useGroupPageReducer() {
  // Calculate initial state inside the hook so store is available
  /**
   * Initial state for the group page reducer.
   * 
   * Creates the initial state object with default values, including
   * tutorial-based drawer expansion settings and empty collections.
   * 
   * @constant {Object} initialState
   * @property {string|null} initialState.rightDrawerContentID - No content initially
   * @property {boolean} initialState.expandRightDrawer - Based on tutorial settings
   * @property {number} initialState.skeletonElementsToDisplay - No skeleton elements initially
   * @property {boolean} initialState.pageRequiresDrawerToBeOpen - Drawer required by default
   * @property {Set} initialState.highlightedItems - Empty set of highlighted items
   */
  const initialState = {
    rightDrawerContentID: null,
    expandRightDrawer: shouldExpandRightDrawer(true),
    skeletonElementsToDisplay: 0,
    pageRequiresDrawerToBeOpen: true,
    highlightedItems: new Set(),
    pageView: "planner",
  };

  const [state, dispatch] = useReducer(groupPageReducer, initialState);

  /**
   * Action dispatchers for the group page state.
   * 
   * Provides convenient methods to dispatch actions to the reducer,
   * abstracting away the action creation and dispatch logic.
   */
  const actions = {
    /**
     * Sets the content ID for the right drawer.
     * 
     * @param {string|null} rightDrawerContentID - Content ID to display in the drawer
     * 
     * @example
     * actions.setRightDrawerContentID('group-details');
     * actions.setRightDrawerContentID(null); // Clear drawer content
     */
    setRightDrawerContentID: (rightDrawerContentID) => {
      dispatch({
        type: GROUP_PAGE_ACTION_TYPES.SET_RIGHT_DRAWER_CONTENT_ID,
        payload: rightDrawerContentID,
      });
    },
    /**
     * Sets whether the right drawer should be expanded.
     * 
     * @param {boolean} expandRightDrawer - Whether to expand the drawer
     * 
     * @example
     * actions.setExpandRightDrawer(true); // Open drawer
     * actions.setExpandRightDrawer(false); // Close drawer
     */
    setExpandRightDrawer: (expandRightDrawer) => {
      dispatch({
        type: GROUP_PAGE_ACTION_TYPES.SET_EXPAND_RIGHT_DRAWER,
        payload: expandRightDrawer,
      });
    },
    /**
     * Sets the number of skeleton elements to display during loading.
     * 
     * @param {number} skeletonElementsToDisplay - Number of skeleton elements to show
     * 
     * @example
     * actions.setSkeletonElementsToDisplay(5); // Show 5 skeleton elements
     * actions.setSkeletonElementsToDisplay(0); // Hide skeleton elements
     */
    setSkeletonElementsToDisplay: (skeletonElementsToDisplay) => {
      dispatch({
        type: GROUP_PAGE_ACTION_TYPES.SET_SKELETON_ELEMENTS_TO_DISPLAY,
        payload: skeletonElementsToDisplay,
      });
    },
    /**
     * Sets whether the page requires the drawer to be open.
     * 
     * @param {boolean} pageRequiresDrawerToBeOpen - Whether page requires drawer to be open
     * 
     * @example
     * actions.setPageRequiresDrawerToBeOpen(true); // Require drawer open
     * actions.setPageRequiresDrawerToBeOpen(false); // Allow drawer closed
     */
    setPageRequiresDrawerToBeOpen: (pageRequiresDrawerToBeOpen) => {
      dispatch({
        type: GROUP_PAGE_ACTION_TYPES.SET_PAGE_REQUIRES_DRAWER_TO_BE_OPEN,
        payload: pageRequiresDrawerToBeOpen,
      });
    },
    /**
     * Sets the collection of highlighted items.
     * 
     * @param {Set} highlightedItems - Set of item IDs to highlight
     * 
     * @example
     * actions.setHighlightedItems(new Set(['item-1', 'item-2', 'item-3']));
     * actions.setHighlightedItems(new Set()); // Clear highlights
     */
    setHighlightedItems: (highlightedItems) => {
      dispatch({
        type: GROUP_PAGE_ACTION_TYPES.SET_HIGHLIGHTED_ITEMS,
        payload: highlightedItems,
      });
    },
    setPageView: (pageView) => {
      dispatch({
        type: GROUP_PAGE_ACTION_TYPES.SET_PAGE_VIEW,
        payload: pageView,
      });
    },
  };

  return { state, actions };
}

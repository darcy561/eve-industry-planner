/**
 * Job Planner Reducer Hook for EVE Industry Planner.
 * 
 * Custom React hook that provides state management for the job planner page component.
 * Uses useReducer with a custom reducer to handle UI state transitions for
 * drawer management, skeleton loading, and page requirements functionality.
 * 
 * @fileoverview Custom hook for job planner page state management
 * @author EVE Industry Planner Team
 */

import { useReducer } from "react";
import {
  jobPlannerReducer,
  JOB_PLANNER_ACTION_TYPES,
} from "./jobPlannerReducer";
import { shouldExpandRightDrawer } from "../../Tutorials/Functions/checkDisplayTutorials";

/**
 * Custom hook for managing job planner page state.
 * 
 * Provides a reducer-based state management solution for the job planner page,
 * including initial state creation based on tutorial settings, action
 * dispatching, and state access. The hook manages UI state including
 * drawer visibility, skeleton loading, and page requirements.
 * 
 * @returns {Object} Hook return object
 * @returns {Object} returns.state - Current page state
 * @returns {boolean} returns.state.expandRightDrawer - Whether the right drawer should be expanded
 * @returns {string|null} returns.state.rightDrawerContentID - Content ID for the right drawer
 * @returns {number} returns.state.skeletonElementsToDisplay - Number of skeleton elements to show
 * @returns {boolean} returns.state.pageRequiresDrawerToBeOpen - Whether page requires drawer to be open
 * @returns {Object} returns.actions - Action dispatchers
 * @returns {Function} returns.actions.setExpandRightDrawer - Set right drawer expansion state
 * @returns {Function} returns.actions.setRightDrawerContentID - Set right drawer content ID
 * @returns {Function} returns.actions.setSkeletonElementsToDisplay - Set skeleton elements count
 * @returns {Function} returns.actions.setPageRequiresDrawerToBeOpen - Set drawer requirement state
 * 
 * @example
 * function JobPlannerPage() {
 *   const { state, actions } = useJobPlannerReducer();
 *   
 *   const handleOpenDrawer = (contentID) => {
 *     actions.setRightDrawerContentID(contentID);
 *     actions.setExpandRightDrawer(true);
 *   };
 *   
 *   const handleShowSkeleton = (count) => {
 *     actions.setSkeletonElementsToDisplay(count);
 *   };
 *   
 *   return (
 *     <div>
 *       Drawer expanded: {state.expandRightDrawer ? 'Yes' : 'No'}
 *       Content: {state.rightDrawerContentID || 'None'}
 *       Skeleton elements: {state.skeletonElementsToDisplay}
 *     </div>
 *   );
 * }
 */
export default function useJobPlannerReducer() {
  // Calculate initial state inside the hook so store is available
  /**
   * Initial state for the job planner reducer.
   * 
   * Creates the initial state object with default values, including
   * tutorial-based drawer expansion settings and empty collections.
   * 
   * @constant {Object} initialState
   * @property {boolean} initialState.pageRequiresDrawerToBeOpen - Drawer not required by default
   * @property {boolean} initialState.expandRightDrawer - Based on tutorial settings (false)
   * @property {string|null} initialState.rightDrawerContentID - No content initially
   * @property {number} initialState.skeletonElementsToDisplay - No skeleton elements initially
   */
  const initialState = {
    pageRequiresDrawerToBeOpen: false,
    expandRightDrawer: shouldExpandRightDrawer(false),
    rightDrawerContentID: null,
    skeletonElementsToDisplay: 0,
  };

  const [state, dispatch] = useReducer(jobPlannerReducer, initialState);

  /**
   * Action dispatchers for the job planner page state.
   * 
   * Provides convenient methods to dispatch actions to the reducer,
   * abstracting away the action creation and dispatch logic.
   */
  const actions = {
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
        type: JOB_PLANNER_ACTION_TYPES.SET_EXPAND_RIGHT_DRAWER,
        payload: expandRightDrawer,
      });
    },
    /**
     * Sets the content ID for the right drawer.
     * 
     * Note: This action preserves the current drawer expansion state
     * to allow tutorial logic to control drawer visibility.
     * 
     * @param {string|null} rightDrawerContentID - Content ID to display in the drawer
     * 
     * @example
     * actions.setRightDrawerContentID('job-details');
     * actions.setRightDrawerContentID('blueprint-info');
     * actions.setRightDrawerContentID(null); // Clear drawer content
     */
    setRightDrawerContentID: (rightDrawerContentID) => {
      dispatch({
        type: JOB_PLANNER_ACTION_TYPES.SET_RIGHT_DRAWER_CONTENT_ID,
        payload: rightDrawerContentID,
      });
    },
    /**
     * Sets the number of skeleton elements to display during loading.
     * 
     * @param {number} skeletonElementsToDisplay - Number of skeleton elements to show
     * 
     * @example
     * actions.setSkeletonElementsToDisplay(3); // Show 3 skeleton elements
     * actions.setSkeletonElementsToDisplay(0); // Hide skeleton elements
     */
    setSkeletonElementsToDisplay: (skeletonElementsToDisplay) => {
      dispatch({
        type: JOB_PLANNER_ACTION_TYPES.SET_SKELETON_ELEMENTS_TO_DISPLAY,
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
        type: JOB_PLANNER_ACTION_TYPES.SET_PAGE_REQUIRES_DRAWER_TO_BE_OPEN,
        payload: pageRequiresDrawerToBeOpen,
      });
    },
  };

  return { state, actions };
}

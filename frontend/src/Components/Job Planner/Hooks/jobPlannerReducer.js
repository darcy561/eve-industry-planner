/**
 * Job Planner Reducer for EVE Industry Planner.
 * 
 * Manages state transitions for the job planner page component, handling actions
 * for right drawer management, skeleton loading states, and page requirements.
 * This reducer provides centralized state management for the job planner UI.
 * 
 * @fileoverview Reducer for job planner page state management
 * @author EVE Industry Planner Team
 */

/**
 * Action types for the job planner reducer.
 * 
 * Defines all possible action types that can be dispatched to modify
 * the job planner page state. Each action type corresponds to a specific
 * UI state change operation.
 * 
 * @constant {Object} JOB_PLANNER_ACTION_TYPES
 * @property {string} SET_EXPAND_RIGHT_DRAWER - Set whether the right drawer should be expanded
 * @property {string} SET_RIGHT_DRAWER_CONTENT_ID - Set the content ID for the right drawer
 * @property {string} SET_SKELETON_ELEMENTS_TO_DISPLAY - Set number of skeleton elements to show
 * @property {string} SET_PAGE_REQUIRES_DRAWER_TO_BE_OPEN - Set if page requires drawer to be open
 */
export const JOB_PLANNER_ACTION_TYPES = {
  SET_EXPAND_RIGHT_DRAWER: "SET_EXPAND_RIGHT_DRAWER",
  SET_RIGHT_DRAWER_CONTENT_ID: "SET_RIGHT_DRAWER_CONTENT_ID",
  SET_SKELETON_ELEMENTS_TO_DISPLAY: "SET_SKELETON_ELEMENTS_TO_DISPLAY",
  SET_PAGE_REQUIRES_DRAWER_TO_BE_OPEN: "SET_PAGE_REQUIRES_DRAWER_TO_BE_OPEN",
};

/**
 * Reducer function for managing job planner page state.
 * 
 * Handles state transitions based on action types, providing immutable
 * state updates for the job planner page component. Manages UI state including
 * drawer visibility, skeleton loading, and page requirements. Includes special
 * logic to preserve drawer expansion state when setting content ID.
 * 
 * @param {Object} state - Current state object
 * @param {boolean} state.expandRightDrawer - Whether the right drawer should be expanded
 * @param {string|null} state.rightDrawerContentID - Content ID for the right drawer
 * @param {number} state.skeletonElementsToDisplay - Number of skeleton elements to show
 * @param {boolean} state.pageRequiresDrawerToBeOpen - Whether page requires drawer to be open
 * @param {Object} action - Action object containing type and payload
 * @param {string} action.type - Action type from JOB_PLANNER_ACTION_TYPES
 * @param {*} [action.payload] - Action payload data
 * @returns {Object} New state object
 * 
 * @example
 * const newState = jobPlannerReducer(currentState, {
 *   type: JOB_PLANNER_ACTION_TYPES.SET_RIGHT_DRAWER_CONTENT_ID,
 *   payload: 'job-details'
 * });
 */
export function jobPlannerReducer(state, action) {
  switch (action.type) {
    case JOB_PLANNER_ACTION_TYPES.SET_EXPAND_RIGHT_DRAWER:
      return { ...state, expandRightDrawer: action.payload };
    case JOB_PLANNER_ACTION_TYPES.SET_RIGHT_DRAWER_CONTENT_ID:
      return {
        ...state,
        rightDrawerContentID: action.payload,
        // Don't automatically expand drawer - let the tutorial logic control it
        expandRightDrawer: state.expandRightDrawer
      };
    case JOB_PLANNER_ACTION_TYPES.SET_SKELETON_ELEMENTS_TO_DISPLAY:
      return { ...state, skeletonElementsToDisplay: action.payload };
    case JOB_PLANNER_ACTION_TYPES.SET_PAGE_REQUIRES_DRAWER_TO_BE_OPEN:
      return { ...state, pageRequiresDrawerToBeOpen: action.payload };
    default:
      return state;
  }
}

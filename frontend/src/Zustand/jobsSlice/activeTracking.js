/**
 * Active Tracking Management for EVE Industry Planner.
 * 
 * Handles active job and group tracking including setting active job/group IDs
 * and managing active state. Provides methods for tracking currently active
 * jobs and groups in the interface.
 * 
 * @fileoverview Active job and group tracking operations
 * @author EVE Industry Planner Team
 */

/**
 * Active tracking management actions for jobs slice.
 * 
 * Provides methods for managing active job and group tracking including
 * setting active IDs and managing active state.
 * 
 * @param {Function} set - Zustand set function for updating state
 * @param {Function} get - Zustand get function for accessing current state
 * @returns {Object} Active tracking management actions
 */
export const activeTrackingActions = (set, get) => ({
  /**
   * Sets the active job ID.
   * 
   * @param {string|null} jobID - Job ID to set as active
   * 
   * @example
   * store.getState().jobData.actions.setActiveJobID('job-123');
   * store.getState().jobData.actions.setActiveJobID(null);
   */
  setActiveJobID: (jobID) => {
    set(
      (state) => ({
        ...state,
        jobData: {
          ...state.jobData,
          activeJobID: jobID,
        },
      }),
      false,
      "setActiveJobID"
    );
  },

  /**
   * Sets the active group ID.
   *
   * @param {string|null} groupID - Group ID to set as active; prefer `clearActiveGroupID()` when clearing (no null).
   *
   * @example
   * store.getState().jobData.actions.setActiveGroupID('group-123');
   */
  setActiveGroupID: (groupID) => {
    set(
      (state) => ({
        ...state,
        jobData: {
          ...state.jobData,
          activeGroupID: groupID,
        },
      }),
      false,
      "setActiveGroupID"
    );
  },

  /**
   * Clears the active group (sets `activeGroupID` to `null`).
   */
  clearActiveGroupID: () => {
    set(
      (state) => ({
        ...state,
        jobData: {
          ...state.jobData,
          activeGroupID: null,
        },
      }),
      false,
      "clearActiveGroupID"
    );
  },

  /**
   * Clears `activeGroupID` only when it equals `groupID` (e.g. closing/deleting the group being edited).
   *
   * @param {string|null|undefined} groupID
   */
  clearActiveGroupIfMatches: (groupID) => {
    if (groupID == null || groupID === "") return;
    if (get().jobData.activeGroupID !== groupID) return;
    get().jobData.actions.clearActiveGroupID();
  },
});

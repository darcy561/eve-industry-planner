/**
 * Group Management for EVE Industry Planner.
 *
 * Handles group operations including adding, removing, updating, and managing
 * group arrays. Provides methods for group CRUD operations and group-related
 * functionality.
 *
 * @fileoverview Group management operations
 * @author EVE Industry Planner Team
 */

/**
 * Group management actions for jobs slice.
 *
 * Provides methods for managing groups including adding, removing, updating,
 * and retrieving group data.
 *
 * @param {Function} set - Zustand set function for updating state
 * @param {Function} get - Zustand get function for accessing current state
 * @returns {Object} Group management actions
 */
export const groupManagementActions = (set, get) => ({
  /**
   * Replaces the entire group array.
   *
   * @param {Array} groupArray - New group array
   *
   * @example
   * store.getState().jobData.actions.replaceGroupArray(newGroupArray);
   */
  replaceGroupArray: (groupArray) => {
    set(
      (state) => ({
        ...state,
        jobData: {
          ...state.jobData,
          groupArray: groupArray || [],
        },
      }),
      false,
      "replaceGroupArray"
    );
  },

  /**
   * Adds a group to the group array.
   *
   * @param {Object} group - Group object to add
   *
   * @example
   * store.getState().jobData.actions.addGroupToGroupArray(newGroup);
   */
  addGroupToGroupArray: (group) => {
    set(
      (state) => ({
        ...state,
        jobData: {
          ...state.jobData,
          groupArray: [...state.jobData.groupArray, group],
        },
      }),
      false,
      "addGroupToGroupArray"
    );
  },

  /**
   * Removes a group from the group array by group ID.
   *
   * @param {string} groupID - Group ID to remove
   *
   * @example
   * store.getState().jobData.actions.removeGroupFromGroupArray('group-123');
   */
  removeGroupFromGroupArray: (groupID) => {
    set(
      (state) => ({
        ...state,
        jobData: {
          ...state.jobData,
          groupArray: state.jobData.groupArray.filter(
            (group) => group.groupID !== groupID
          ),
        },
      }),
      false,
      "removeGroupFromGroupArray"
    );
  },

  /**
   * Gets the active group object.
   *
   * @returns {Object|null} Active group object or null if not found
   *
   * @example
   * const activeGroup = store.getState().jobData.actions.getActiveGroupObject();
   * if (activeGroup) console.log(activeGroup.name);
   */
  getActiveGroupObject: () => {
    const state = get().jobData;
    return (
      state.groupArray?.find(
        (group) => group.groupID === state.activeGroupID
      ) || null
    );
  },

  /**
   * Gets a group object by group ID.
   *
   * @param {string} groupID - Group ID to search for
   * @returns {Object|null} Group object or null if not found
   *
   * @example
   * const group = store.getState().jobData.actions.getGroupObject('group-123');
   * if (group) console.log(group.name);
   */
  getGroupObject: (groupID) => {
    const state = get().jobData;
    const foundGroup = state.groupArray?.find(
      (group) => group.groupID === groupID
    );
    return foundGroup || null;
  },

  /**
   * Updates modified groups in the group array.
   *
   * @param {Array|Object} inputGroups - Array of modified group objects or a single modified group object
   *
   * @example
   * store.getState().jobData.actions.updateModifiedGroups(modifiedGroups);
   */
  updateModifiedGroups: (inputGroups) => {
    if (!inputGroups) return;

    const modifiedGroups = Array.isArray(inputGroups)
      ? inputGroups
      : [inputGroups];
    set(
      (state) => {
        const updatedGroupArray = state.jobData.groupArray.map((group) => {
          const modifiedGroup = modifiedGroups.find(
            (mg) => mg.groupID === group.groupID
          );
          return modifiedGroup || group;
        });

        return {
          ...state,
          jobData: {
            ...state.jobData,
            groupArray: updatedGroupArray,
          },
        };
      },
      false,
      "updateModifiedGroups"
    );
  },

  getGroupArrayForFirebase: () => {
    const state = get().jobData;
    return state.groupArray.map((group) => group.toDocument());
  },
});

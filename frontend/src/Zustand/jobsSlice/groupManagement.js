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

import { scheduleDebouncedGroupSave } from "../../Functions/Debounce/jobGroupsPersistSchedule.js";

/** @param {string[]|undefined} prev @param {string[]} ids */
function mergePendingJobGroupWrites(prev, ids) {
  return [...new Set([...(prev ?? []), ...ids.filter(Boolean)])];
}

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
   * @param {{ fromServer?: boolean; skipRealtimeResync?: boolean }} [opts] – `fromServer`: full REST sync (clears pending writes).
   *   `skipRealtimeResync`: set when applying a WS/NATS doc so we do not re-send subscribe storms.
   * @example
   * store.getState().jobData.actions.replaceGroupArray(newGroupArray);
   */
  replaceGroupArray: (groupArray, opts = {}) => {
    const fromServer = opts.fromServer === true;
    const skipRealtimeResync = opts.skipRealtimeResync === true;
    set(
      (state) => ({
        ...state,
        jobData: {
          ...state.jobData,
          groupArray: groupArray || [],
          ...(fromServer ? { pendingJobGroupWrites: [] } : {}),
        },
      }),
      false,
      "replaceGroupArray"
    );
    if (!fromServer && !skipRealtimeResync) {
      void import("../../Realtime/syncJobGroupWebSocketSubscriptions.js").then(
        (m) => m.syncJobGroupWebSocketSubscriptions()
      );
    }
  },

  /**
   * Queues job groups for the next API persist (`PUT /api/v1/groups`); merges into `pendingJobGroupWrites`.
   * @param {string|string[]} groupIDs
   */
  queueJobGroupWrites: (groupIDs) => {
    const ids = Array.isArray(groupIDs) ? groupIDs : [groupIDs];
    if (!ids.length) return;
    set(
      (state) => ({
        ...state,
        jobData: {
          ...state.jobData,
          pendingJobGroupWrites: mergePendingJobGroupWrites(
            state.jobData.pendingJobGroupWrites,
            ids
          ),
        },
      }),
      false,
      "queueJobGroupWrites"
    );
  },

  /**
   * {@link queueJobGroupWrites} and start the debounced `PUT /api/v1/groups` timer (`scheduleDebouncedGroupSave` from `Functions/Debounce`).
   * Use this when the user should get a server save without waiting for tab hide/close.
   * For queue-only (e.g. you will `flushPendingGroupSave` in the same flow), use `queueJobGroupWrites` alone.
   * @param {string|string[]} groupIDs
   */
  queueJobGroupWritesAndSchedule: (groupIDs) => {
    get().jobData.actions.queueJobGroupWrites(groupIDs);
    scheduleDebouncedGroupSave();
  },

  /**
   * Removes group IDs from the pending-write queue (after a successful persist or a server-pushed document).
   * @param {string|string[]} [groupIDs] – omit to clear the whole queue
   */
  clearPendingJobGroupWrites: (groupIDs) => {
    set(
      (state) => {
        const cur = state.jobData.pendingJobGroupWrites ?? [];
        if (groupIDs == null) {
          return {
            ...state,
            jobData: { ...state.jobData, pendingJobGroupWrites: [] },
          };
        }
        const remove = new Set(
          Array.isArray(groupIDs) ? groupIDs : [groupIDs]
        );
        return {
          ...state,
          jobData: {
            ...state.jobData,
            pendingJobGroupWrites: cur.filter((id) => !remove.has(id)),
          },
        };
      },
      false,
      "clearPendingJobGroupWrites"
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
          pendingJobGroupWrites: group?.groupID
            ? mergePendingJobGroupWrites(state.jobData.pendingJobGroupWrites, [
                group.groupID,
              ])
            : state.jobData.pendingJobGroupWrites,
        },
      }),
      false,
      "addGroupToGroupArray"
    );
    void import("../../Realtime/syncJobGroupWebSocketSubscriptions.js").then(
      (m) => m.syncJobGroupWebSocketSubscriptions()
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
          pendingJobGroupWrites: (
            state.jobData.pendingJobGroupWrites ?? []
          ).filter((id) => id !== groupID),
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
    const queuedIds = modifiedGroups.map((g) => g.groupID).filter(Boolean);
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
            pendingJobGroupWrites: mergePendingJobGroupWrites(
              state.jobData.pendingJobGroupWrites,
              queuedIds
            ),
          },
        };
      },
      false,
      "updateModifiedGroups"
    );
    scheduleDebouncedGroupSave();
  },

  /** Documents for groups in `pendingJobGroupWrites` that still exist in `groupArray`. */
  getPendingJobGroupWritesPayload: () => {
    const state = get().jobData;
    const queued = new Set(state.pendingJobGroupWrites ?? []);
    if (queued.size === 0) return [];
    return state.groupArray
      .filter((group) => queued.has(group.groupID))
      .map((group) => group.toDocument());
  },
});

/**
 * Server Status Management for EVE Industry Planner.
 * 
 * Handles EVE Online server status operations including updating server status
 * and player count. Provides methods for managing server status data.
 * 
 * @fileoverview Server status management operations
 * @author EVE Industry Planner Team
 */

/**
 * Server status management actions for world data slice.
 * 
 * Provides methods for managing EVE Online server status and player count.
 * 
 * @param {Function} set - Zustand set function for updating state
 * @param {Function} get - Zustand get function for accessing current state
 * @returns {Object} Server status management actions
 */
export const serverStatusActions = (set, get) => ({
  /**
   * Updates EVE Online server status and player count.
   * 
   * @param {Object} inputObject - Server status data
   * @param {boolean} inputObject.eveServerStatus - Whether EVE servers are online
   * @param {number} inputObject.evePlayerCount - Current player count
   * 
   * @example
   * store.getState().worldData.actions.updateEveServerStatus({
   *   eveServerStatus: true,
   *   evePlayerCount: 25000
   * });
   */
  updateEveServerStatus: (inputObject = {}) => {  
    set((state) => ({
      ...state,
      worldData: {
        ...state.worldData,
        eveServerStatus: inputObject.eveServerStatus,
        evePlayerCount: inputObject.evePlayerCount,
      },
    }), false, "updateEveServerStatus");
  },
});

/**
 * System Indexes Management for EVE Industry Planner.
 * 
 * Handles system index operations including adding system indexes and finding
 * system index data. Provides methods for managing system cost indexes and
 * system index data retrieval.
 * 
 * @fileoverview System indexes management operations
 * @author EVE Industry Planner Team
 */

/**
 * System indexes management actions for world data slice.
 * 
 * Provides methods for managing system indexes including adding and finding
 * system cost index data.
 * 
 * @param {Function} set - Zustand set function for updating state
 * @param {Function} get - Zustand get function for accessing current state
 * @returns {Object} System indexes management actions
 */
export const systemIndexesActions = (set, get) => ({
  /**
   * Adds system index data to the store.
   * 
   * Merges new system cost index data with existing data.
   * 
   * @param {Object} inputObject - System index data object
   * @param {number} inputObject[systemID] - System cost index for specific system ID
   * 
   * @example
   * store.getState().worldData.actions.addSystemIndex({
   *   30000142: 0.0125, // Jita system index
   *   30002187: 0.0150  // Amarr system index
   * });
   */
  addSystemIndex: (inputObject = {}) => {
    set((state) => ({
      ...state,
      worldData: {
        ...state.worldData,
        systemIndexes: {
          ...state.worldData.systemIndexes,
          ...inputObject,
        },
      },
    }), false, "addSystemIndex");
  },

  /**
   * Finds system index data by requested ID.
   * 
   * @param {number} requestedID - System ID to search for
   * @param {Object} alternativeLocation - Alternative location to search in
   * @returns {number|null} System cost index or null if not found
   * 
   * @example
   * const systemIndex = store.getState().worldData.actions.findSystemIndex(30000142);
   * if (systemIndex !== null) console.log('Jita system index:', systemIndex);
   */
  findSystemIndex: (requestedID, alternativeLocation = {}) => {
    if (!requestedID) return null;
    const state = get();
    return (
      state.worldData.systemIndexes[requestedID] ||
      alternativeLocation[requestedID]
    );
  },
});

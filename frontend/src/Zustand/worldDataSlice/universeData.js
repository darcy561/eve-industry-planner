/**
 * Universe Data Management for EVE Industry Planner.
 * 
 * Handles universe ID operations including adding universe IDs and finding
 * universe data. Provides methods for managing universe ID mappings and
 * universe data retrieval.
 * 
 * @fileoverview Universe data management operations
 * @author EVE Industry Planner Team
 */

/**
 * Universe data management actions for world data slice.
 * 
 * Provides methods for managing universe IDs and universe data including
 * adding and finding universe data.
 * 
 * @param {Function} set - Zustand set function for updating state
 * @param {Function} get - Zustand get function for accessing current state
 * @returns {Object} Universe data management actions
 */
export const universeDataActions = (set, get) => ({
  /**
   * Adds universe ID mappings to the store.
   * 
   * Merges new universe ID data (systems, stations, regions, etc.) with existing data.
   * 
   * @param {Object} inputObject - Universe ID mappings
   * @param {Object} inputObject[systemID] - System data object
   * @param {string} inputObject[systemID].name - System name
   * @param {number} inputObject[systemID].security - System security level
   * 
   * @example
   * store.getState().worldData.actions.addUniverseIDs({
   *   30000142: { name: "Jita", security: 0.9 },
   *   30002187: { name: "Amarr", security: 0.5 }
   * });
   */
  addUniverseIDs: (inputObject = {}) => {
    set((state) => ({
      ...state,
      worldData: {
        ...state.worldData,
        universeIDs: {
          ...state.worldData.universeIDs,
          ...inputObject,
        },
      },
    }), false, "addUniverseIDs");
  },

  /**
   * Finds universe data by requested ID.
   * 
   * @param {number} requestedID - ID to search for
   * @param {Object} alternativeLocation - Alternative location to search in
   * @returns {Object|null} Universe data object or null if not found
   * 
   * @example
   * const systemData = store.getState().worldData.actions.findUniverseData(30000142);
   * if (systemData) console.log(systemData.name);
   */
  findUniverseData: (requestedID, alternativeLocation = {}) => {
    if (!requestedID) return null;
    const state = get();

    return (
      state.worldData.universeIDs[requestedID] ||
      alternativeLocation[requestedID] ||
      null
    );
  },
});

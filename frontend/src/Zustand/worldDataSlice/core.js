/**
 * Core World Data Management for EVE Industry Planner.
 */

/**
 * Default state configuration for world data.
 *
 * @returns {Object} Default world data state
 * @property {Object} systemIndexes - System cost index data
 */
export const stateDefault = () => ({
  systemIndexes: {},
});

/**
 * Core actions for world data management.
 *
 * @param {Function} set - Zustand set function for updating state
 * @param {Function} get - Zustand get function for accessing current state
 * @returns {Object} Core world data management actions
 */
export const coreActions = (set) => ({
  /**
   * Resets the world data store to its default state.
   *
   * Clears all world data including system indexes,
   * while preserving the actions object.
   */
  resetWorldDataStore: () => {
    set(
      (state) => ({
        ...state,
        worldData: {
          ...state.worldData,
          ...stateDefault(),
          actions: state.worldData.actions,
        },
      }),
      false,
      "resetWorldDataStore",
    );
  },
});

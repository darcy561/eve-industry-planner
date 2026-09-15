/**
 * The system cost indexes an account has entered by hand, for systems the SDE
 * carries no index for.
 *
 * @param {Function} set - Zustand set function for updating state
 * @param {Function} get - Zustand get function for accessing current state
 * @returns {Object} Predefined system index actions
 */
export const predefinedSystemIndexActions = (set, get) => ({
  /**
   * Merges new indexes in, one activity type at a time, so a system keeps the
   * activity types the incoming data says nothing about.
   *
   * @param {Object<string, Object<string, number>>} newIndexes - system id -> activity type -> index
   */
  updatePredefinedSystemIndexes: (newIndexes) =>
    set(
      (state) => {
        const mergedIndexes = {
          ...state.applicationSettings.predefinedSystemIndexes,
        };

        Object.entries(newIndexes).forEach(([systemID, systemData]) => {
          mergedIndexes[systemID] = {
            ...mergedIndexes[systemID],
            ...systemData,
          };
        });

        return {
          ...state,
          applicationSettings: {
            ...state.applicationSettings,
            predefinedSystemIndexes: mergedIndexes,
          },
        };
      },
      false,
      "updatePredefinedSystemIndexes",
    ),

  /**
   * @param {number} systemID
   * @returns {Object<string, number>|undefined} the system's indexes by activity type
   */
  findPredefinedSystemIndex: (systemID) => {
    const state = get().applicationSettings;
    return state.predefinedSystemIndexes[systemID];
  },

  /**
   * Removes one activity type from a system, and the system itself once it
   * holds no activity types — an empty system would otherwise read as one the
   * account has entered indexes for.
   *
   * @param {number} systemID
   * @param {string} indexType
   */
  deletePredefinedSystemIndexType: (systemID, indexType) =>
    set(
      (state) => {
        const newIndexes = {
          ...state.applicationSettings.predefinedSystemIndexes,
        };
        const currentSystemData = newIndexes[systemID];
        if (!currentSystemData) return state;

        const updatedSystemData = { ...currentSystemData };
        delete updatedSystemData[indexType];

        if (Object.keys(updatedSystemData).length === 0) {
          delete newIndexes[systemID];
        } else {
          newIndexes[systemID] = updatedSystemData;
        }

        return {
          ...state,
          applicationSettings: {
            ...state.applicationSettings,
            predefinedSystemIndexes: newIndexes,
          },
        };
      },
      false,
      "deletePredefinedSystemIndexType",
    ),
});

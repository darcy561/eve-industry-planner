/**
 * Application Settings Slice for EVE Industry Planner.
 */

import {
  stateDefault,
  coreActions,
  structureActions,
  preferencesActions,
  predefinedSystemIndexActions,
} from "./applicationSettings";

/**
 * Application Settings Slice for Zustand Store.
 *
 * @param {Function} set - Zustand set function for updating state
 * @param {Function} get - Zustand get function for accessing current state
 * @returns {Object} Application settings slice with state and actions
 */
const applicationSettingsSlice = (set, get) => ({
  applicationSettings: {
    ...stateDefault(),

    actions: {
      ...coreActions(set, get),
      ...structureActions(set, get),
      ...preferencesActions(set, get),
      ...predefinedSystemIndexActions(set, get),
    },
  },
});

export default applicationSettingsSlice;

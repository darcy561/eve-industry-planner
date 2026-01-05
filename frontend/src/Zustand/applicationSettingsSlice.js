/**
 * Application Settings Slice for EVE Industry Planner.
 * 
 * Manages application-wide settings including user preferences, market configurations,
 * structure settings, reprocessing options, and localization settings. This slice
 * provides centralized state management for all application settings that persist
 * across user sessions.
 * 
 * @fileoverview Application settings state management slice for EVE Industry Planner
 * @author EVE Industry Planner Team
 */

import {
  stateDefault,
  coreActions,
  structureActions,
  preferencesActions,
  extrasActions,
} from './applicationSettings';

/**
 * Application Settings Slice for Zustand Store.
 * 
 * Creates the application settings slice with state and actions for managing
 * application-wide settings. Provides methods for updating settings, managing
 * structures, handling user preferences, and maintaining application state.
 * 
 * @param {Function} set - Zustand set function for updating state
 * @param {Function} get - Zustand get function for accessing current state
 * @returns {Object} Application settings slice with state and actions
 * 
 * @example
 * const useApplicationSettings = create((set, get) => ({
 *   ...applicationSettingsSlice(set, get)
 * }));
 */
const applicationSettingsSlice = (set, get) => ({
  //state
  applicationSettings: {
    ...stateDefault(),

    //actions
    actions: {
      // Core actions
      ...coreActions(set, get),
      
      // Structure management actions
      ...structureActions(set, get),
      
      // User preferences actions
      ...preferencesActions(set, get),
      
      // Extras management actions
      ...extrasActions(set, get),
    },
  },
});

export default applicationSettingsSlice;
/**
 * User Slice for EVE Industry Planner.
 * 
 * Manages user-related state including Firebase listeners.
 * This slice provides
 * centralized state management for all user-related operations and data.
 * 
 * @fileoverview User management state slice for EVE Industry Planner
 * @author EVE Industry Planner Team
 */

import {
  stateDefault,
  coreActions,
  userManagementActions,
} from './userSlice/index.js';

/**
 * User Settings Slice for Zustand Store.
 * 
 * Creates the user settings slice with state and actions for managing user-related
 * data including authentication, linked data, and Firebase configurations.
 * 
 * @param {Function} set - Zustand set function for updating state
 * @param {Function} get - Zustand get function for accessing current state
 * @returns {Object} User settings slice with state and actions
 * 
 * @example
 * const useUserSettings = create((set, get) => ({
 *   ...userSettingsSlice(set, get)
 * }));
 */
const userSettingsSlice = (set, get) => ({
  users: {
    ...stateDefault(),

    actions: {
      // Core actions
      ...coreActions(set, get),
      
      // User management actions
      ...userManagementActions(set, get),
    },
  },
});

export default userSettingsSlice;
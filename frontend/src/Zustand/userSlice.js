/**
 * User Slice for EVE Industry Planner.
 * 
 * Manages user-related state including authentication status, user arrays,
 * linked orders/jobs/transactions, refresh tokens, corporation objects,
 * Firebase listeners, and job status configurations. This slice provides
 * centralized state management for all user-related operations and data.
 * 
 * @fileoverview User management state slice for EVE Industry Planner
 * @author EVE Industry Planner Team
 */

import {
  stateDefault,
  coreActions,
  userManagementActions,
  tokenManagementActions,
  corporationManagementActions,
} from './userSlice/index.js';

/**
 * User Settings Slice for Zustand Store.
 * 
 * Creates the user settings slice with state and actions for managing user-related
 * data including authentication, user arrays, linked data, corporation objects,
 * and Firebase configurations.
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
      
      // Token management actions
      ...tokenManagementActions(set, get),
      
      // Corporation management actions
      ...corporationManagementActions(set, get),
    },
  },
});

export default userSettingsSlice;
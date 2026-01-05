/**
 * Core User Management for EVE Industry Planner.
 * 
 * Contains the default state configuration and core actions for managing
 * user-related data including state initialization, document conversion,
 * and basic user operations.
 * 
 * @fileoverview Core user management state and actions
 * @author EVE Industry Planner Team
 */

import User from "../../Classes/usersConstructor";
import { jobStatusDefault } from "../../Context/defaultValues";

/**
 * Default state configuration for user data.
 * 
 * Defines the initial state values for all user-related data including
 * authentication status, user arrays, linked data, and Firebase configurations.
 * 
 * @returns {Object} Default user state
 * @property {boolean} isLoggedIn - Whether user is currently logged in
 * @property {Array} userArray - Array of User objects
 * @property {Set} linkedOrders - Set of linked order IDs
 * @property {Set} linkedJobs - Set of linked job IDs
 * @property {Set} linkedTrans - Set of linked transaction IDs
 * @property {Array} accountRefreshTokens - Array of refresh tokens
 * @property {Object|null} indexDB - IndexedDB instance
 * @property {Object} corporationObjects - Corporation data objects
 * @property {boolean} isFirstTimeLogin - Whether this is first time login
 * @property {Array} firebaseListeners - Array of Firebase listeners
 * @property {Array} jobStatus - Job status configuration array
 */
export const stateDefault = () => ({
  isLoggedIn: false,
  userArray: [new User(undefined, undefined, true)],
  linkedOrders: new Set(),
  linkedJobs: new Set(),
  linkedTrans: new Set(),
  accountRefreshTokens: [],
  indexDB: null,
  corporationObjects: {},
  isFirstTimeLogin: false,
  firebaseListeners: [],
  jobStatus: jobStatusDefault,
});

/**
 * Core actions for user management.
 * 
 * Provides essential actions for managing user state including resetting state,
 * converting to document format, and basic authentication operations.
 * 
 * @param {Function} set - Zustand set function for updating state
 * @param {Function} get - Zustand get function for accessing current state
 * @returns {Object} Core user management actions
 */
export const coreActions = (set, get) => ({
  /**
   * Resets the users settings store to its default state.
   * 
   * Clears all user data including user arrays, linked data, refresh tokens,
   * and corporation objects, while preserving the actions object.
   * 
   * @example
   * store.getState().users.actions.resetUsersSettingsStore();
   */
  resetUsersSettingsStore: () => {
    set((state) => ({
      ...state,
      users: {
        ...state.users,
        ...stateDefault(),
        actions: state.users.actions,
      }
    }), false, "resetUsersSettingsStore");
  },

  /**
   * Converts user state to document format for storage.
   * 
   * Creates a document object containing all user data that needs to be
   * persisted to Firebase or other storage systems.
   * 
   * @returns {Object} Document object for storage
   * @returns {Array} returns.linkedOrders - Array of linked order IDs
   * @returns {Array} returns.linkedJobs - Array of linked job IDs
   * @returns {Array} returns.linkedTrans - Array of linked transaction IDs
   * @returns {Array} returns.refreshTokens - Array of refresh tokens
   * @returns {Array} returns.jobStatusArray - Job status configuration array
   * 
   * @example
   * const document = store.getState().users.actions.toDocument();
   * await saveToFirebase(document);
   */
  toDocument: () => {
    const state = get().users;
    return {
      linkedOrders: [...(state.linkedOrders || [])],
      linkedJobs: [...(state.linkedJobs || [])],
      linkedTrans: [...(state.linkedTrans || [])],
      refreshTokens: state.accountRefreshTokens,
      jobStatusArray: state.jobStatus,
    };
  },

  /**
   * Toggles the logged in status.
   * 
   * Switches between logged in and logged out states.
   * 
   * @example
   * store.getState().users.actions.toggleIsLoggedIn();
   */
  toggleIsLoggedIn: () => {
    set((state) => ({
      ...state,
      users: {
        ...state.users,
        isLoggedIn: !state.users.isLoggedIn,
      }
    }), false, "toggleIsLoggedIn");
  },

  /**
   * Sets the first time login flag.
   * 
   * @param {boolean} isFirstTime - Whether this is the first time login
   * 
   * @example
   * store.getState().users.actions.setIsFirstTimeLogin(true);
   */
  setIsFirstTimeLogin: (isFirstTime) => {
    set((state) => ({
      ...state,
      users: {
        ...state.users,
        isFirstTimeLogin: isFirstTime,
      }
    }), false, "setIsFirstTimeLogin");
  },

  /**
   * Updates the job status configuration array.
   * 
   * @param {Array} statusArray - New job status configuration array
   * 
   * @example
   * store.getState().users.actions.updateJobStatus(newStatusArray);
   */
  updateJobStatus: (statusArray) => {
    set((state) => ({
      ...state,
      users: {
        ...state.users,
        jobStatus: statusArray,
      }
    }), false, "updateJobStatus");
  },

  /**
   * Adds or removes linked ESI data (orders, jobs, transactions).
   * 
   * Manages the sets of linked ESI IDs for tracking real-time data from EVE Online API.
   * Supports both adding new IDs and removing existing ones.
   * 
   * @param {Object} esiData - ESI data object containing IDs to add or remove
   * @param {Set|Array} [esiData.ordersToAdd] - Order IDs to add to linked orders
   * @param {Set|Array} [esiData.jobsToAdd] - Job IDs to add to linked jobs
   * @param {Set|Array} [esiData.transactionsToAdd] - Transaction IDs to add to linked transactions
   * @param {Set|Array} [esiData.ordersToRemove] - Order IDs to remove from linked orders
   * @param {Set|Array} [esiData.jobsToRemove] - Job IDs to remove from linked jobs
   * @param {Set|Array} [esiData.transactionsToRemove] - Transaction IDs to remove from linked transactions
   * 
   * @example
   * // Add new linked ESI data
   * store.getState().users.actions.addLinkedEsiData({
   *   ordersToAdd: new Set([12345, 67890]),
   *   jobsToAdd: new Set([11111, 22222]),
   *   transactionsToAdd: new Set([33333, 44444])
   * });
   * 
   * @example
   * // Remove linked ESI data
   * store.getState().users.actions.addLinkedEsiData({
   *   ordersToRemove: new Set([12345]),
   *   jobsToRemove: new Set([11111]),
   *   transactionsToRemove: new Set([33333])
   * });
   */
  addLinkedEsiData: (esiData) => {
    if (!esiData) return;
    
    set((state) => {
      const newState = { ...state };
      const users = { ...newState.users };
      
      // Handle adding new IDs
      if (esiData.ordersToAdd) {
        users.linkedOrders = new Set([...users.linkedOrders, ...esiData.ordersToAdd]);
      }
      if (esiData.jobsToAdd) {
        users.linkedJobs = new Set([...users.linkedJobs, ...esiData.jobsToAdd]);
      }
      if (esiData.transactionsToAdd) {
        users.linkedTrans = new Set([...users.linkedTrans, ...esiData.transactionsToAdd]);
      }
      
      // Handle removing IDs - convert to Set if it's an Array
      if (esiData.ordersToRemove) {
        const removeSet = esiData.ordersToRemove instanceof Set ? esiData.ordersToRemove : new Set(esiData.ordersToRemove);
        users.linkedOrders = new Set([...users.linkedOrders].filter(id => !removeSet.has(id)));
      }
      if (esiData.jobsToRemove) {
        const removeSet = esiData.jobsToRemove instanceof Set ? esiData.jobsToRemove : new Set(esiData.jobsToRemove);
        users.linkedJobs = new Set([...users.linkedJobs].filter(id => !removeSet.has(id)));
      }
      if (esiData.transactionsToRemove) {
        const removeSet = esiData.transactionsToRemove instanceof Set ? esiData.transactionsToRemove : new Set(esiData.transactionsToRemove);
        users.linkedTrans = new Set([...users.linkedTrans].filter(id => !removeSet.has(id)));
      }
      
      return {
        ...newState,
        users
      };
    }, false, "addLinkedEsiData");
  },
});

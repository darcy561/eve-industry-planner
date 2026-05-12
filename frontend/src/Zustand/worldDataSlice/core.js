/**
 * Core World Data Management for EVE Industry Planner.
 * 
 * Contains the default state configuration and core actions for managing
 * world-related data including state initialization and basic world data operations.
 * 
 * @fileoverview Core world data management state and actions
 * @author EVE Industry Planner Team
 */

import GLOBAL_CONFIG from "../../global-config-app";

const { MARKET_OPTIONS } = GLOBAL_CONFIG;

/**
 * Default state configuration for world data.
 * 
 * Defines the initial state values for all world-related data including
 * market data, universe IDs, and system indexes.
 * 
 * @returns {Object} Default world data state
 * @property {Object} marketData - Market price data by type ID
 * @property {Object} universeIDs - Universe ID mappings (systems, stations, etc.)
 * @property {Object} systemIndexes - System cost index data
 */
export const stateDefault = () => ({
  marketData: {},
  universeIDs: {},
  systemIndexes: {},
});

/**
 * Core actions for world data management.
 * 
 * Provides essential actions for managing world data state including resetting state.
 * 
 * @param {Function} set - Zustand set function for updating state
 * @param {Function} get - Zustand get function for accessing current state
 * @returns {Object} Core world data management actions
 */
export const coreActions = (set, get) => ({
  /**
   * Resets the world data store to its default state.
   * 
   * Clears all world data including market data, universe IDs, and system indexes,
   * while preserving the actions object.
   * 
   * @example
   * store.getState().worldData.actions.resetWorldDataStore();
   */
  resetWorldDataStore: () => {
    set((state) => ({
      ...state,
      worldData: {
        ...state.worldData,
        ...stateDefault(),
        actions: state.worldData.actions,
      },
    }), false, "resetWorldDataStore");
  },
});

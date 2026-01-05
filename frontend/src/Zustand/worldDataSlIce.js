/**
 * World Data Slice for EVE Industry Planner.
 * 
 * Manages world-related data including market data, universe IDs, system indexes,
 * EVE server status, and player count. This slice provides centralized state
 * management for all EVE Online world data that is shared across the application.
 * 
 * @fileoverview World data state management slice for EVE Industry Planner
 * @author EVE Industry Planner Team
 */

import {
  stateDefault,
  coreActions,
  serverStatusActions,
  universeDataActions,
  marketDataActions,
  systemIndexesActions,
} from './worldDataSlice/index.js';

/**
 * World Data Slice for Zustand Store.
 * 
 * Creates the world data slice with state and actions for managing EVE Online
 * world data including market data, universe IDs, system indexes, and server status.
 * Provides methods for updating and retrieving world data throughout the application.
 * 
 * @param {Function} set - Zustand set function for updating state
 * @param {Function} get - Zustand get function for accessing current state
 * @returns {Object} World data slice with state and actions
 * 
 * @example
 * const useWorldData = create((set, get) => ({
 *   ...worldDataSlice(set, get)
 * }));
 */
const worldDataSlice = (set, get) => ({
  worldData: {
    ...stateDefault(),

    actions: {
      // Core actions
      ...coreActions(set, get),
      
      // Server status actions
      ...serverStatusActions(set, get),
      
      // Universe data actions
      ...universeDataActions(set, get),
      
      // Market data actions
      ...marketDataActions(set, get),
      
      // System indexes actions
      ...systemIndexesActions(set, get),
    },
  },
});

export default worldDataSlice;
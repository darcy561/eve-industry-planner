/**
 * World Data Slice for EVE Industry Planner.
 */

import {
  stateDefault,
  coreActions,
  universeDataActions,
  marketDataActions,
  systemIndexesActions,
} from './worldDataSlice/index.js';

/**
 * World Data Slice for Zustand Store.
 *
 * @param {Function} set - Zustand set function for updating state
 * @param {Function} get - Zustand get function for accessing current state
 * @returns {Object} World data slice with state and actions
 */
const worldDataSlice = (set, get) => ({
  worldData: {
    ...stateDefault(),

    actions: {
      // Core actions
      ...coreActions(set, get),
      
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
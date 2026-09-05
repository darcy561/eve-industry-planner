/**
 * Jobs Slice for EVE Industry Planner.
 */

import {
  stateDefault,
  coreActions,
  inboundSkeletonActions,
  multiSelectionActions,
  activeTrackingActions,
  watchlistManagementActions,
  groupManagementActions,
  jobDocumentPersistenceActions,
} from './jobsSlice/index.js';

/**
 * Jobs Slice for Zustand Store.
 *
 * @param {Function} set - Zustand set function for updating state
 * @param {Function} get - Zustand get function for accessing current state
 * @returns {Object} Jobs slice with state and actions
 */
const jobsSlice = (set, get) => ({
  jobData: {
    ...stateDefault(),
    actions: {
      // Core actions
      ...coreActions(set, get),

      ...inboundSkeletonActions(set, get),
      
      // Multi-selection actions
      ...multiSelectionActions(set, get),
      
      // Active tracking actions
      ...activeTrackingActions(set, get),
      
      // Watchlist management actions
      ...watchlistManagementActions(set, get),
      
      // Group management actions
      ...groupManagementActions(set, get),

      // Job document API persistence (debounced PUT)
      ...jobDocumentPersistenceActions(set, get),
    },
  },
});

export default jobsSlice;
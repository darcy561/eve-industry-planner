/**
 * Jobs Slice for EVE Industry Planner.
 * 
 * Manages job-related state including job arrays, group arrays, multi-selection,
 * active job/group tracking, job snapshots, and watchlist data.
 * This slice provides centralized state management for all job-related operations
 * and user interactions within the industry planner.
 * 
 * @fileoverview Jobs and groups state management slice for EVE Industry Planner
 * @author EVE Industry Planner Team
 */

import {
  stateDefault,
  coreActions,
  multiSelectionActions,
  activeTrackingActions,
  watchlistManagementActions,
  groupManagementActions,
  jobSnapshotsActions,
} from './jobsSlice/index.js';

/**
 * Jobs Slice for Zustand Store.
 * 
 * Creates the jobs slice with state and actions for managing job-related data
 * including job arrays, group arrays, multi-selection, active job tracking,
 * and watchlist management.
 * 
 * @param {Function} set - Zustand set function for updating state
 * @param {Function} get - Zustand get function for accessing current state
 * @returns {Object} Jobs slice with state and actions
 * 
 * @example
 * const useJobs = create((set, get) => ({
 *   ...jobsSlice(set, get)
 * }));
 */
const jobsSlice = (set, get) => ({
  jobData: {
    ...stateDefault(),
    actions: {
      // Core actions
      ...coreActions(set, get),
      
      // Multi-selection actions
      ...multiSelectionActions(set, get),
      
      // Active tracking actions
      ...activeTrackingActions(set, get),
      
      // Watchlist management actions
      ...watchlistManagementActions(set, get),
      
      // Group management actions
      ...groupManagementActions(set, get),
      
      // Job snapshots actions
      ...jobSnapshotsActions(set, get),
    },
  },
});

export default jobsSlice;
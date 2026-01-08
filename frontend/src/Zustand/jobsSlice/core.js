/**
 * Core Jobs Management for EVE Industry Planner.
 *
 * Contains the default state configuration and core actions for managing
 * job-related data including state initialization and basic job operations.
 *
 * @fileoverview Core jobs management state and actions
 * @author EVE Industry Planner Team
 */

import JobSnapshot from "../../Classes/jobSnapshotConstructor";

/**
 * Default state configuration for jobs data.
 *
 * Defines the initial state values for all job-related data including
 * job arrays, group arrays, selection state, and watchlist data.
 *
 * @returns {Object} Default jobs state
 * @property {Array} multiSelect - Array of selected job/group IDs
 * @property {Array} jobArray - Array of job objects
 * @property {Array} groupArray - Array of group objects
 * @property {string|null} activeJobID - Currently active job ID
 * @property {string|null} activeGroupID - Currently active group ID
 * @property {Array} archivedJobs - Array of archived job data
 * @property {Array} userJobSnapshot - Array of job snapshot objects
 * @property {Object} userWatchlist - User's watchlist data
 * @property {Array} userWatchlist.groups - Watchlist group objects
 * @property {Array} userWatchlist.items - Watchlist item objects
 */
export const stateDefault = () => ({
  multiSelect: [],
  jobArray: [],
  groupArray: [],
  activeJobID: null,
  activeGroupID: null,
  archivedJobs: [],
  userJobSnapshot: [],
  userWatchlist: {
    groups: [],
    items: [],
  },
});

/**
 * Core actions for jobs management.
 *
 * Provides essential actions for managing job state including resetting state.
 *
 * @param {Function} set - Zustand set function for updating state
 * @param {Function} get - Zustand get function for accessing current state
 * @returns {Object} Core jobs management actions
 */
export const coreActions = (set, get) => ({
  /**
   * Resets the job data store to its default state.
   *
   * Clears all job-related data including job arrays, group arrays,
   * multi-selection, active job/group tracking, and watchlist data,
   * while preserving the actions object.
   *
   * @param {*} data - Unused parameter (kept for compatibility)
   *
   * @example
   * store.getState().jobData.actions.resetJobDataStore();
   */
  resetJobDataStore: (data) => {
    set(
      (state) => ({
        ...state,
        jobData: {
          ...state.jobData,
          ...stateDefault(),
          actions: state.jobData.actions,
        },
      }),
      false,
      "resetJobDataStore"
    );
  },

  /**
   * Clears the job array (sets it to empty array).
   *
   * @example
   * store.getState().jobData.actions.clearJobArray();
   */
  clearJobArray: () => {
    set(
      (state) => ({
        ...state,
        jobData: {
          ...state.jobData,
          jobArray: [],
        },
      }),
      false,
      "clearJobArray"
    );
  },

  /**
   * Replaces the entire job array.
   *
   * @param {Array} jobArray - New job array
   *
   * @example
   * store.getState().jobData.actions.replaceJobArray(newJobArray);
   */
  replaceJobArray: (jobArray) => {
    set(
      (state) => ({
        ...state,
        jobData: {
          ...state.jobData,
          jobArray: jobArray || [],
        },
      }),
      false,
      "replaceJobArray"
    );
  },

  /**
   * Adds retrieved jobs to the job array (avoiding duplicates).
   *
   * @param {Array} jobs - Array of job objects to add
   *
   * @example
   * store.getState().jobData.actions.addRetrievedJobsToJobArray(jobs);
   */
  addRetrievedJobsToJobArray: (jobs) => {
    const state = get().jobData;
    const existingIDs = new Set(state.jobArray.map(({ jobID }) => jobID));
    const newJobs = jobs.filter(({ jobID }) => !existingIDs.has(jobID));

    set(
      (state) => ({
        ...state,
        jobData: {
          ...state.jobData,
          jobArray: [...state.jobData.jobArray, ...newJobs],
        },
      }),
      false,
      "addRetrievedJobsToJobArray"
    );
  },

  /**
   * Adds jobs to the job array (avoiding duplicates).
   *
   * @param {Array|Object} jobs - Job object(s) to add
   *
   * @example
   * store.getState().jobData.actions.addJobsToJobArray(jobs);
   */
  addJobsToJobArray: (jobs) => {
    const state = get().jobData;
    const inputJobs = Array.isArray(jobs) ? jobs : [jobs];
    const existingIDs = new Set(state.jobArray.map(({ jobID }) => jobID));
    const newJobs = inputJobs.filter(({ jobID }) => !existingIDs.has(jobID));

    set(
      (state) => ({
        ...state,
        jobData: {
          ...state.jobData,
          jobArray: [...state.jobData.jobArray, ...newJobs],
        },
      }),
      false,
      "addJobsToJobArray"
    );
  },

  /**
   * Replaces or adds jobs to the job array.
   *
   * @param {Array|Object} jobs - Job object(s) to replace or add
   *
   * @example
   * store.getState().jobData.actions.updateOrAddJobsToJobArray(jobs);
   */
  updateOrAddJobsToJobArray: (jobs) => {
    const inputArray = Array.isArray(jobs) ? jobs : [jobs];

    // Deduplicate incoming jobs (keep last occurrence of each jobID)
    const jobsMap = new Map();
    inputArray.forEach((job) => {
      jobsMap.set(job.jobID, job);
    });
    const inputJobs = Array.from(jobsMap.values());

    set(
      (state) => {
        // Create a Set of incoming job IDs for quick lookup
        const incomingJobIDs = new Set(inputJobs.map((j) => j.jobID));

        // Remove all jobs that match incoming job IDs (removes duplicates)
        // Keep only jobs that don't match any incoming job IDs
        const jobsToKeep = state.jobData.jobArray.filter(
          (job) => !incomingJobIDs.has(job.jobID)
        );

        // Add all incoming jobs (replaces any duplicates)
        return {
          ...state,
          jobData: {
            ...state.jobData,
            jobArray: [...jobsToKeep, ...inputJobs],
          },
        };
      },
      false,
      "updateOrAddJobsToJobArray"
    );
  },

  /**
   * Merges jobs and removes specified jobs from the job array.
   *
   * @param {Array|Object} jobsToAdd - Job object(s) to add
   * @param {Array|string} jobIDsToRemove - Job ID(s) to remove
   *
   * @example
   * store.getState().jobData.actions.mergeAndRemoveJobsFromJobArray(jobsToAdd, jobIDsToRemove);
   */
  mergeAndRemoveJobsFromJobArray: (jobsToAdd, jobIDsToRemove) => {
    const inputJobs = Array.isArray(jobsToAdd) ? jobsToAdd : [jobsToAdd];
    const jobIDsToDelete = Array.isArray(jobIDsToRemove)
      ? jobIDsToRemove
      : [jobIDsToRemove];

    set(
      (state) => {
        const existingIDs = new Set(
          state.jobData.jobArray.map(({ jobID }) => jobID)
        );
        const mergedJobs = [
          ...state.jobData.jobArray,
          ...inputJobs.filter(({ jobID }) => !existingIDs.has(jobID)),
        ];
        const filteredJobs = mergedJobs.filter(
          (job) => !jobIDsToDelete.includes(job.jobID)
        );

        return {
          ...state,
          jobData: {
            ...state.jobData,
            jobArray: filteredJobs,
          },
        };
      },
      false,
      "mergeAndRemoveJobsFromJobArray"
    );
  },

  /**
   * Removes jobs from the job array by job IDs.
   *
   * @param {Array|string} jobIDs - Job ID(s) to remove
   *
   * @example
   * store.getState().jobData.actions.removeJobsFromJobArray(['job-123', 'job-456']);
   */
  removeJobsFromJobArray: (jobIDs) => {
    const jobIDsToRemove = Array.isArray(jobIDs) ? jobIDs : [jobIDs];

    set(
      (state) => ({
        ...state,
        jobData: {
          ...state.jobData,
          jobArray: state.jobData.jobArray.filter(
            (i) => !jobIDsToRemove.includes(i.jobID)
          ),
        },
      }),
      false,
      "removeJobsFromJobArray"
    );
  },

  /**
   * Finds a job in the job array by job ID.
   *
   * @param {string} jobID - Job ID to find
   * @returns {Object|null} Job object or null if not found
   *
   * @example
   * const job = store.getState().jobData.actions.findJobInJobArray('job-123');
   */
  findJobInJobArray: (jobID) => {
    const state = get().jobData;
    return state.jobArray.find((i) => i.jobID === jobID);
  },
});

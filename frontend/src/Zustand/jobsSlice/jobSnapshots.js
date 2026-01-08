/**
 * Job Snapshots Management for EVE Industry Planner.
 *
 * Handles job snapshot operations including adding, removing, updating, and managing
 * job snapshot arrays. Provides methods for job snapshot CRUD operations and
 * snapshot-related functionality.
 *
 * @fileoverview Job snapshots management operations
 * @author EVE Industry Planner Team
 */

import JobSnapshot from "../../Classes/jobSnapshotConstructor";

/**
 * Job snapshots management actions for jobs slice.
 *
 * Provides methods for managing job snapshots including adding, removing,
 * updating, and clearing snapshot data.
 *
 * @param {Function} set - Zustand set function for updating state
 * @param {Function} get - Zustand get function for accessing current state
 * @returns {Object} Job snapshots management actions
 */
export const jobSnapshotsActions = (set, get) => ({
  /**
   * Replaces the entire user job snapshot array.
   *
   * @param {Array} userJobSnapshot - New job snapshot array
   *
   * @example
   * store.getState().jobData.actions.replaceUserJobSnapshotArray(newSnapshots);
   */
  replaceUserJobSnapshotArray: (userJobSnapshot) => {
    set(
      (state) => ({
        ...state,
        jobData: {
          ...state.jobData,
          userJobSnapshot: userJobSnapshot || [],
        },
      }),
      false,
      "replaceUserJobSnapshotArray"
    );
  },

  /**
   * Clears the user job snapshot array.
   *
   * Removes all job snapshots from the array.
   *
   * @example
   * store.getState().jobData.actions.clearUserJobSnapshotArray();
   */
  clearUserJobSnapshotArray: () => {
    set(
      (state) => ({
        ...state,
        jobData: {
          ...state.jobData,
          userJobSnapshot: [],
        },
      }),
      false,
      "clearUserJobSnapshotArray"
    );
  },

  /**
   * Accepts an array or single job object and creates new job snapshots and adds them to the user job snapshot array.
   *
   * @param {Array|Object} inputJobs - Array of job objects or single job object to create new job snapshots from
   *
   * @example
   * store.getState().jobData.actions.addJobsToUserJobSnapshotArray(jobs);
   */
  addJobsToUserJobSnapshotArray: (inputJobs) => {
    if (!inputJobs) {
      console.error("Input jobs not provided");
      return;
    }

    const inputArray = Array.isArray(inputJobs) ? inputJobs : [inputJobs];

    // Deduplicate incoming jobs (keep last occurrence of each jobID)
    const jobsMap = new Map();
    inputArray.forEach((job) => {
      jobsMap.set(job.jobID, job);
    });
    const jobsToProcess = Array.from(jobsMap.values());

    set(
      (state) => {
        // Create a Set of existing job IDs for quick lookup
        const existingJobIDs = new Set(
          state.jobData.userJobSnapshot.map((i) => i.jobID)
        );

        // Filter out jobs that already exist to prevent duplicates
        const newJobs = jobsToProcess.filter(
          (j) => !existingJobIDs.has(j.jobID)
        );

        // Create new snapshots only for jobs that don't already exist
        const newSnapshots = newJobs.map((j) => new JobSnapshot(j));

        return {
          ...state,
          jobData: {
            ...state.jobData,
            userJobSnapshot: [
              ...state.jobData.userJobSnapshot,
              ...newSnapshots,
            ],
          },
        };
      },
      false,
      "addJobsToUserJobSnapshotArray"
    );
  },

  /**
   * Removes jobs from the user job snapshot array.
   *
   * @param {Array|string} jobIDs - Job IDs to remove
   *
   * @example
   * store.getState().jobData.actions.removeJobsFromUserJobSnapshotArray(['job-123', 'job-456']);
   */
  removeJobsFromUserJobSnapshotArray: (jobIDs) => {
    if (jobIDs instanceof Set) {
      jobIDs = Array.from(jobIDs);
    }
    const jobIDsToRemove = Array.isArray(jobIDs) ? jobIDs : [jobIDs];

    if (jobIDsToRemove.length === 0) return;

    set(
      (state) => ({
        ...state,
        jobData: {
          ...state.jobData,
          userJobSnapshot: state.jobData.userJobSnapshot.filter(
            (i) => !jobIDsToRemove.includes(i.jobID)
          ),
        },
      }),
      false,
      "removeJobsFromUserJobSnapshotArray"
    );
  },

  /**
   * Finds a job in the user job snapshot array.
   *
   * @param {string} jobID - Job ID to find
   * @returns {Object|null} Job snapshot or null if not found
   *
   * @example
   * const jobSnapshot = store.getState().jobData.actions.findJobInUserJobSnapshotArray('job-123');
   */
  findJobInUserJobSnapshotArray: (jobID) => {
    const state = get().jobData;
    return state.userJobSnapshot.find((i) => i.jobID === jobID);
  },

  /**
   * Accepts an array or single job object and updates or adds job snapshots to the user job snapshot array.
   *
   * @param {Array|Object} updatedJobs - Array of job objects or single job object to update or add to job snapshots
   *
   * @example
   * store.getState().jobData.actions.updateJobSnapshotsFromJobs(updatedJob);
   */
  updateJobSnapshotsFromJobs: (updatedJobs) => {
    if (!updatedJobs) {
      console.error("Updated job not provided");
      return;
    }
    const state = get().jobData;
    const inputArray = Array.isArray(updatedJobs) ? updatedJobs : [updatedJobs];

    // Deduplicate incoming jobs (keep last occurrence of each jobID)
    const jobsMap = new Map();
    inputArray.forEach((job) => {
      jobsMap.set(job.jobID, job);
    });
    const jobsToUpdate = Array.from(jobsMap.values());

    // Create a Set of incoming job IDs for quick lookup
    const incomingJobIDs = new Set(jobsToUpdate.map((j) => j.jobID));

    // Remove all snapshots that match incoming job IDs (removes duplicates)
    // Keep only snapshots that don't match any incoming job IDs
    const snapshotsToKeep = state.userJobSnapshot.filter(
      (i) => !incomingJobIDs.has(i.jobID)
    );

    // Create new snapshots for all incoming jobs (replaces any duplicates)
    // Only include jobs that already exist in the snapshot array
    const existingJobIDs = new Set(state.userJobSnapshot.map((i) => i.jobID));
    const updatedSnapshots = jobsToUpdate
      .filter((j) => existingJobIDs.has(j.jobID))
      .map((j) => new JobSnapshot(j));

    set(
      (state) => ({
        ...state,
        jobData: {
          ...state.jobData,
          userJobSnapshot: [...snapshotsToKeep, ...updatedSnapshots],
        },
      }),
      false,
      "updateJobSnapshot"
    );
  },

  /**
   * Accepts an array or single job object and updates or adds job snapshots to the user job snapshot array.
   *
   * @param {Array|Object} inputJobs - Array of job objects or single job object to update or add to job snapshots
   *
   * @example
   * store.getState().jobData.actions.addOrUpdateJobSnapshotsFromJobs(jobs);
   */
  addOrUpdateJobSnapshotsFromJobs: (inputJobs) => {
    if (!inputJobs) {
      console.error("Input jobs not provided");
      return;
    }
    const state = get().jobData;
    const inputArray = Array.isArray(inputJobs) ? inputJobs : [inputJobs];

    // Deduplicate incoming jobs (keep last occurrence of each jobID)
    const jobsMap = new Map();
    inputArray.forEach((job) => {
      jobsMap.set(job.jobID, job);
    });
    const jobsToProcess = Array.from(jobsMap.values());

    // Create a Set of incoming job IDs for quick lookup
    const incomingJobIDs = new Set(jobsToProcess.map((j) => j.jobID));

    // Remove all snapshots that match incoming job IDs (removes duplicates)
    // Keep only snapshots that don't match any incoming job IDs
    const snapshotsToKeep = state.userJobSnapshot.filter(
      (i) => !incomingJobIDs.has(i.jobID)
    );

    // Create new snapshots for all incoming jobs (replaces any duplicates)
    const newSnapshots = jobsToProcess.map((j) => new JobSnapshot(j));

    set(
      (state) => ({
        ...state,
        jobData: {
          ...state.jobData,
          userJobSnapshot: [...snapshotsToKeep, ...newSnapshots],
        },
      }),
      false,
      "addOrUpdateJobSnapshotsFromJobs"
    );
  },
  getUserJobSnapshotForFirebase: () => {
    const state = get().jobData;
    return state.userJobSnapshot.map((i) => i.toDocument());
  },
});

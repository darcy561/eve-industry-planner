/**
 * Core Jobs Management for EVE Industry Planner.
 */

import { requestJobDocumentsByIdsFromApi } from "../../Functions/Endpoints/Private/requestJobDocumentsByIds.js";
import retrieveJobIDsFromGroupObjects from "../../Functions/Helper/getJobIDsFromGroupObjects";
import separateGroupAndJobIDs from "../../Functions/Helper/separateGroupAndJobIDs";
import { stateDefault } from "./stateDefault.js";

/**
 * Core actions for jobs management.
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
   */
  resetJobDataStore: () => {
    set(
      (state) => ({
        jobData: {
          ...state.jobData,
          ...stateDefault(),
        },
      }),
      false,
      "resetJobDataStore",
    );
  },

  /**
   * Clears the job array (sets it to empty array).
   */
  clearJobArray: () => {
    set(
      (state) => ({
        jobData: {
          ...state.jobData,
          jobArray: [],
        },
      }),
      false,
      "clearJobArray",
    );
  },

  /**
   * Replaces the entire job array.
   *
   * @param {Array} jobArray - New job array
   * @param {{ fromServer?: boolean, owner?: string|null }} [opts] - `fromServer`: full REST
   *   sync (clears pending job-document writes). `owner`: the planner the array is for.
   */
  replaceJobArray: (jobArray, opts = {}) => {
    const fromServer = opts.fromServer === true;
    set(
      (state) => ({
        jobData: {
          ...state.jobData,
          jobArray: jobArray || [],
          ...(opts.owner === undefined ? {} : { owner: opts.owner }),
          ...(fromServer ? { pendingJobDocumentWrites: [] } : {}),
        },
      }),
      false,
      "replaceJobArray",
    );
  },

  /**
   * Adds retrieved jobs to the job array (avoiding duplicates).
   *
   * @param {Array} jobs - Array of job objects to add
   */
  addRetrievedJobsToJobArray: (jobs) => {
    const state = get().jobData;
    const existingIDs = new Set(state.jobArray.map(({ jobID }) => jobID));
    const newJobs = jobs.filter(({ jobID }) => !existingIDs.has(jobID));

    set(
      (state) => ({
        jobData: {
          ...state.jobData,
          jobArray: [...state.jobData.jobArray, ...newJobs],
        },
      }),
      false,
      "addRetrievedJobsToJobArray",
    );
  },

  /**
   * Adds jobs to the job array (avoiding duplicates).
   *
   * @param {Array|Object} jobs - Job object(s) to add
   */
  addJobsToJobArray: (jobs) => {
    const state = get().jobData;
    const inputJobs = Array.isArray(jobs) ? jobs : [jobs];
    const existingIDs = new Set(state.jobArray.map(({ jobID }) => jobID));
    const newJobs = inputJobs.filter(({ jobID }) => !existingIDs.has(jobID));

    set(
      (state) => ({
        jobData: {
          ...state.jobData,
          jobArray: [...state.jobData.jobArray, ...newJobs],
        },
      }),
      false,
      "addJobsToJobArray",
    );
  },

  /**
   * Replaces or adds jobs to the job array.
   *
   * @param {Array|Object} jobs - Job object(s) to replace or add
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
          (job) => !incomingJobIDs.has(job.jobID),
        );

        // Add all incoming jobs (replaces any duplicates)
        return {
          jobData: {
            ...state.jobData,
            jobArray: [...jobsToKeep, ...inputJobs],
          },
        };
      },
      false,
      "updateOrAddJobsToJobArray",
    );
  },

  /**
   * Merges jobs and removes specified jobs from the job array.
   *
   * @param {Array|Object} jobsToAdd - Job object(s) to add
   * @param {Array|string} jobIDsToRemove - Job ID(s) to remove
   */
  mergeAndRemoveJobsFromJobArray: (jobsToAdd, jobIDsToRemove) => {
    const inputJobs = Array.isArray(jobsToAdd) ? jobsToAdd : [jobsToAdd];
    const jobIDsToDelete = Array.isArray(jobIDsToRemove)
      ? jobIDsToRemove
      : [jobIDsToRemove];

    set(
      (state) => {
        const existingIDs = new Set(
          state.jobData.jobArray.map(({ jobID }) => jobID),
        );
        const mergedJobs = [
          ...state.jobData.jobArray,
          ...inputJobs.filter(({ jobID }) => !existingIDs.has(jobID)),
        ];
        const filteredJobs = mergedJobs.filter(
          (job) => !jobIDsToDelete.includes(job.jobID),
        );

        return {
          jobData: {
            ...state.jobData,
            jobArray: filteredJobs,
          },
        };
      },
      false,
      "mergeAndRemoveJobsFromJobArray",
    );
  },

  /**
   * Removes jobs from the job array by job IDs.
   *
   * @param {Array|string} jobIDs - Job ID(s) to remove
   */
  removeJobsFromJobArray: (jobIDs) => {
    const jobIDsToRemove = Array.isArray(jobIDs) ? jobIDs : [jobIDs];
    const removeSet = new Set(jobIDsToRemove);

    set(
      (state) => {
        const next = state.jobData.jobArray.filter(
          (i) => !removeSet.has(i.jobID),
        );
        if (next.length === state.jobData.jobArray.length) return state;
        return {
          jobData: {
            ...state.jobData,
            jobArray: next,
          },
        };
      },
      false,
      "removeJobsFromJobArray",
    );
  },

  /**
   * Finds a job in the job array by job ID.
   *
   * @param {string} jobID - Job ID to find
   * @returns {Object|null} Job object or null if not found
   */
  findJobInJobArray: (jobID) => {
    const state = get().jobData;
    return state.jobArray.find((i) => i.jobID === jobID);
  },

  /**
   * Resolves job IDs and/or Job instances to Job objects: reads from `jobArray`, then
   * POSTs missing IDs (`requestJobDocumentsByIdsFromApi` + merge) when logged in.
   *
   * @param {Array|Set|string|Object|null|undefined} inputItem - IDs, Job objects, or mixed
   * @returns {Promise<Array<Object>>} Jobs found or fetched (deduped by `jobID`, iterable order preserved)
   */
  jobsFromIdsOrObjects: async (inputItem) => {
    const findJobInJobArray = (id) =>
      get().jobData.actions.findJobInJobArray(id);

    const collectStringIdsFromIterable = (iterable) => {
      const ids = new Set();
      for (const item of iterable) {
        if (typeof item === "string" && item.includes("job")) {
          ids.add(item);
        }
      }
      return ids;
    };

    const resolveMissingIds = async (stringIds) => {
      if (!get().account.actions.getIsLoggedIn()) return;
      const missing = [...stringIds].filter((id) => !findJobInJobArray(id));
      if (missing.length === 0) return;
      try {
        const jobs = await requestJobDocumentsByIdsFromApi(missing);
        get().jobData.actions.updateOrAddJobsToJobArray(jobs);
      } catch (err) {
        console.error("jobsFromIdsOrObjects:", err);
      }
    };

    const seen = new Set();
    /** @type {Array<Object>} */
    const out = [];

    const pushJob = (job) => {
      if (!job?.jobID || seen.has(job.jobID)) return;
      seen.add(job.jobID);
      out.push(job);
    };

    const collectJobsFromInputIterable = (iterable) => {
      for (const item of iterable) {
        if (item == null) continue;
        if (typeof item === "object" && typeof item.jobID === "string") {
          pushJob(item);
        } else if (typeof item === "string") {
          if (!item.includes("job")) continue;
          const job = findJobInJobArray(item);
          if (job) pushJob(job);
        }
      }
    };

    if (inputItem == null) return [];

    if (Array.isArray(inputItem) || inputItem instanceof Set) {
      const stringIds = collectStringIdsFromIterable(inputItem);
      await resolveMissingIds(stringIds);
      collectJobsFromInputIterable(inputItem);
      return out;
    }

    if (typeof inputItem === "string") {
      if (!inputItem.includes("job")) return [];
      await resolveMissingIds(new Set([inputItem]));
      const job = findJobInJobArray(inputItem);
      return job ? [job] : [];
    }

    if (
      typeof inputItem === "object" &&
      typeof inputItem.jobID === "string" &&
      !Array.isArray(inputItem) &&
      !(inputItem instanceof Set)
    ) {
      return [inputItem];
    }

    return [];
  },

  /**
   * Resolves full job objects from mixed job + group id strings: expands groups, then
   * {@link jobsFromIdsOrObjects} (local `jobArray` + API for missing when logged in).
   * Used by shopping list, price entry, and similar selection flows.
   *
   * @param {string|string[]} inputJobIDs
   * @returns {Promise<Array<Object>>}
   */
  resolveJobObjectsForMixedSelection: async (inputJobIDs) => {
    const { groupIDs, jobIDs } = separateGroupAndJobIDs(inputJobIDs);
    const groupJobIDs = retrieveJobIDsFromGroupObjects(groupIDs);
    return get().jobData.actions.jobsFromIdsOrObjects([
      ...jobIDs,
      ...groupJobIDs,
    ]);
  },
});

import { vi } from "vitest";
import { standUpStore, storeHolder } from "./rawStoreHarness.js";
import { documentLockKey } from "../Functions/DocumentLock/documentLockKey.js";
import { USER_JOBS_COLLECTION } from "../Functions/DocumentLock/documentLockCollections.js";

const serverJobs = new Map();

/**
 * Sets the jobs the server holds, which `readFromServer` answers by id.
 *
 * @param {Array<object>} jobs
 */
export function serverHolds(jobs) {
  serverJobs.clear();
  for (const job of jobs) serverJobs.set(job.jobID, job);
}

/**
 * Answers a read by id the way the server does, leaving out what it does not hold.
 *
 * @param {Array<string>} ids
 * @returns {Promise<Array<object>>}
 */
export async function readFromServer(ids) {
  return ids.filter((id) => serverJobs.has(id)).map((id) => serverJobs.get(id));
}

/**
 * Builds a planner store holding jobs in a real array, with spies for the actions a test inspects.
 *
 * @param {{isLoggedIn?: boolean, actions?: Record<string, Function>}} [options]
 * @returns {{addLinkedEsiData: Function, actions: Record<string, Function>}}
 */
export function standUpJobPlanner({ isLoggedIn = true, actions = {} } = {}) {
  const addLinkedEsiData = vi.fn();
  const spies = {
    getGroupObject: vi.fn(),
    updateModifiedGroups: vi.fn(),
    removeFromMultiSelect: vi.fn(),
    ...actions,
  };
  const withJobs = (set, change) =>
    set((state) => ({
      jobData: { ...state.jobData, jobArray: change(state.jobData.jobArray) },
    }));
  standUpStore((set, get) => ({
    account: { isLoggedIn, actions: { addLinkedEsiData } },
    documentLock: { scopes: {} },
    jobData: {
      jobArray: [],
      groupArray: [],
      actions: {
        findJobInJobArray: (jobID) =>
          get().jobData.jobArray.find((held) => held.jobID === jobID) ?? null,
        updateOrAddJobsToJobArray: (jobs) =>
          withJobs(set, (held) => [
            ...held.filter(
              (job) => !jobs.some((next) => next.jobID === job.jobID),
            ),
            ...jobs,
          ]),
        removeJobsFromJobArray: (jobIDs) =>
          withJobs(set, (held) =>
            held.filter((job) => !jobIDs.includes(job.jobID)),
          ),
        mergeAndRemoveJobsFromJobArray: (added, removedIDs) =>
          withJobs(set, (held) => [
            ...held.filter(
              (job) =>
                !removedIDs.includes(job.jobID) &&
                !added.some((next) => next.jobID === job.jobID),
            ),
            ...added,
          ]),
        ...spies,
      },
    },
  }));
  return { addLinkedEsiData, actions: spies };
}

/**
 * Puts jobs, and optionally groups, on the planner.
 *
 * @param {Array<object>} jobs
 * @param {Array<object>} [groups]
 */
export function plannerHolds(jobs, groups = []) {
  storeHolder.current.setState((state) => ({
    jobData: { ...state.jobData, jobArray: jobs, groupArray: groups },
  }));
}

/** @returns {Array<string>} The ids of the jobs on the planner */
export function plannerJobIDs() {
  return storeHolder.current
    .getState()
    .jobData.jobArray.map((job) => job.jobID);
}

/**
 * Marks a document as open for editing in another session.
 *
 * @param {string} docID
 * @param {string} [collection]
 */
export function heldElsewhere(docID, collection = USER_JOBS_COLLECTION) {
  storeHolder.current.setState((state) => ({
    documentLock: {
      scopes: {
        ...state.documentLock.scopes,
        [documentLockKey(collection, docID)]: { readOnly: true },
      },
    },
  }));
}

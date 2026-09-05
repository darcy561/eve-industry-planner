/**
 * Edit Job Reducer for EVE Industry Planner.
 */

import Job from "../../../Classes/job";
import { normalizeSetIsLoadingPayload } from "../../../Functions/Helper/setIsLoadingAction";

/**
 * Action types for the edit job reducer.
 *
 * @constant {Object} EDIT_JOB_ACTION_TYPES
 * @property {string} SET_ACTIVE_JOB - Set the active job being edited
 * @property {string} UPDATE_ACTIVE_JOB - Update the active job with new data
 * @property {string} STEP_ACTIVE_JOB_FORWARD - Move job status forward
 * @property {string} STEP_ACTIVE_JOB_BACKWARD - Move job status backward
 * @property {string} MARK_JOB_AS_MODIFIED - Mark job as having unsaved changes
 * @property {string} SET_TEMPORARY_CHILD_JOBS - Set temporary child jobs data
 * @property {string} SET_IS_LOADING - Set loading state
 * @property {string} MARK_PARENT_JOB_FOR_REMOVAL - Mark parent job for removal
 * @property {string} MARK_PARENT_JOB_FOR_ADDITION - Mark parent job for addition
 * @property {string} MARK_CHILD_JOBS_FOR_ADDITION - Mark child jobs for addition
 * @property {string} MARK_CHILD_JOBS_FOR_REMOVAL - Mark child jobs for removal
 * @property {string} ADD_INDUSTRY_ESI_JOBS_FOR_ADDITION - Add ESI industry jobs for linking
 * @property {string} ADD_INDUSTRY_ESI_JOBS_FOR_REMOVAL - Remove ESI industry jobs from linking
 * @property {string} ADD_MARKET_ORDERS_FOR_ADDITION - Add market orders for linking
 * @property {string} ADD_MARKET_ORDERS_FOR_REMOVAL - Remove market orders from linking
 * @property {string} ADD_TRANSACTIONS_FOR_ADDITION - Add transactions for linking
 * @property {string} ADD_TRANSACTIONS_FOR_REMOVAL - Remove transactions from linking
 */
export const EDIT_JOB_ACTION_TYPES = {
  SET_ACTIVE_JOB: "SET_ACTIVE_JOB",
  UPDATE_ACTIVE_JOB: "UPDATE_ACTIVE_JOB",
  STEP_ACTIVE_JOB_FORWARD: "STEP_ACTIVE_JOB_FORWARD",
  STEP_ACTIVE_JOB_BACKWARD: "STEP_ACTIVE_JOB_BACKWARD",
  MARK_JOB_AS_MODIFIED: "MARK_JOB_AS_MODIFIED",
  SET_TEMPORARY_CHILD_JOBS: "SET_TEMPORARY_CHILD_JOBS",
  SET_IS_LOADING: "SET_IS_LOADING",
  MARK_PARENT_JOB_FOR_REMOVAL: "MARK_PARENT_JOB_FOR_REMOVAL",
  MARK_PARENT_JOB_FOR_ADDITION: "MARK_PARENT_JOB_FOR_ADDITION",
  MARK_CHILD_JOBS_FOR_ADDITION: "MARK_CHILD_JOBS_FOR_ADDITION",
  MARK_CHILD_JOBS_FOR_REMOVAL: "MARK_CHILD_JOBS_FOR_REMOVAL",
  ADD_INDUSTRY_ESI_JOBS_FOR_ADDITION: "ADD_INDUSTRY_ESI_JOBS_FOR_ADDITION",
  ADD_INDUSTRY_ESI_JOBS_FOR_REMOVAL: "ADD_INDUSTRY_ESI_JOBS_FOR_REMOVAL",
  ADD_MARKET_ORDERS_FOR_ADDITION: "ADD_MARKET_ORDERS_FOR_ADDITION",
  ADD_MARKET_ORDERS_FOR_REMOVAL: "ADD_MARKET_ORDERS_FOR_REMOVAL",
  ADD_TRANSACTIONS_FOR_ADDITION: "ADD_TRANSACTIONS_FOR_ADDITION",
  ADD_TRANSACTIONS_FOR_REMOVAL: "ADD_TRANSACTIONS_FOR_REMOVAL",
};

/**
 * Reducer function for managing edit job dialogue state.
 *
 * @param {Object} state - Current state object
 * @param {Object|null} state.activeJob - Currently active job being edited
 * @param {boolean} state.jobModified - Whether the job has unsaved changes
 * @param {Object} state.temporaryChildJobs - Temporary child jobs data
 * @param {Object} state.esiDataToLink - ESI data to be linked to the job
 * @param {Object} state.esiDataToLink.industryJobs - Industry jobs to add/remove
 * @param {Object} state.esiDataToLink.marketOrders - Market orders to add/remove
 * @param {Object} state.esiDataToLink.transactions - Transactions to add/remove
 * @param {Object} state.parentChildToEdit - Parent-child job relationship changes
 * @param {Object} state.parentChildToEdit.parentJobs - Parent job changes
 * @param {Object} state.parentChildToEdit.childJobs - Child job changes by material type
 * @param {boolean} state.isLoading - Loading state
 * @param {Object} action - Action object containing type and payload
 * @param {string} action.type - Action type from EDIT_JOB_ACTION_TYPES
 * @param {*} [action.payload] - Action payload data
 * @returns {Object} New state object
 */
export function editJobReducer(state, action) {
  switch (action.type) {
    case EDIT_JOB_ACTION_TYPES.SET_ACTIVE_JOB:
      return { ...state, activeJob: action.payload };
    case EDIT_JOB_ACTION_TYPES.UPDATE_ACTIVE_JOB:
      return {
        ...state,
        jobModified: true,
        activeJob: new Job(action.payload),
      };
    case EDIT_JOB_ACTION_TYPES.STEP_ACTIVE_JOB_FORWARD:
      state.jobModified = true;
      state.activeJob.stepForward();
      return { ...state, activeJob: new Job(state.activeJob) };
    case EDIT_JOB_ACTION_TYPES.STEP_ACTIVE_JOB_BACKWARD:
      state.activeJob.stepBackward();
      state.jobModified = true;
      return { ...state, activeJob: new Job(state.activeJob) };
    case EDIT_JOB_ACTION_TYPES.MARK_JOB_AS_MODIFIED:
      return { ...state, jobModified: true };
    case EDIT_JOB_ACTION_TYPES.SET_TEMPORARY_CHILD_JOBS:
      return { ...state, temporaryChildJobs: action.payload };
    case EDIT_JOB_ACTION_TYPES.SET_IS_LOADING: {
      const { isLoading, loadingMessage } = normalizeSetIsLoadingPayload(
        action.payload,
      );
      return {
        ...state,
        isLoading,
        loadingMessage: isLoading ? loadingMessage : undefined,
      };
    }
    case EDIT_JOB_ACTION_TYPES.MARK_PARENT_JOB_FOR_REMOVAL:
      return {
        ...state,
        jobModified: true,
        parentChildToEdit: {
          ...state.parentChildToEdit,
          parentJobs: {
            ...state.parentChildToEdit.parentJobs,
            add: (state.parentChildToEdit.parentJobs.add || []).filter(
              (id) => id !== action.payload
            ),
            remove: [
              ...new Set([
                ...(state.parentChildToEdit.parentJobs.remove || []),
                action.payload,
              ]),
            ],
          },
        },
      };
    case EDIT_JOB_ACTION_TYPES.MARK_PARENT_JOB_FOR_ADDITION:
      return {
        ...state,
        jobModified: true,
        parentChildToEdit: {
          ...state.parentChildToEdit,
          parentJobs: {
            ...state.parentChildToEdit.parentJobs,
            add: [
              ...new Set([
                ...(state.parentChildToEdit.parentJobs.add || []),
                action.payload,
              ]),
            ],
            remove: (state.parentChildToEdit.parentJobs.remove || []).filter(
              (id) => id !== action.payload
            ),
          },
        },
      };
    case EDIT_JOB_ACTION_TYPES.MARK_CHILD_JOBS_FOR_ADDITION: {
      const jobsToAdd = Array.isArray(action.payload)
        ? action.payload
        : [action.payload];

      const newChildJobs = { ...state.parentChildToEdit.childJobs };
      const newTemporaryChildJobs = { ...state.temporaryChildJobs };

      for (let newJob of jobsToAdd) {
        const childLocation = newChildJobs[newJob.itemID];
        if (!childLocation) {
          newChildJobs[newJob.itemID] = {
            add: [newJob.jobID],
            remove: [],
          };
        } else {
          // Add to existing add array if not already present
          if (!childLocation.add.includes(newJob.jobID)) {
            childLocation.add.push(newJob.jobID);
          }
          if (childLocation.remove.includes(newJob.jobID)) {
            childLocation.remove = childLocation.remove.filter(
              (id) => id !== newJob.jobID
            );
          }
        }

        newTemporaryChildJobs[newJob.itemID] = newJob;
      }

      return {
        ...state,
        jobModified: true,
        temporaryChildJobs: newTemporaryChildJobs,
        parentChildToEdit: {
          ...state.parentChildToEdit,
          childJobs: newChildJobs,
        },
      };
    }
    case EDIT_JOB_ACTION_TYPES.MARK_CHILD_JOBS_FOR_REMOVAL: {
      const jobsToRemove = Array.isArray(action.payload)
        ? action.payload
        : [action.payload];

      const newChildJobs = { ...state.parentChildToEdit.childJobs };
      const newTemporaryChildJobs = { ...state.temporaryChildJobs };

      for (let jobToRemove of jobsToRemove) {
        const childLocation = newChildJobs[jobToRemove.itemID];
        if (childLocation) {
          // Remove from add array if present
          if (childLocation.add.includes(jobToRemove.jobID)) {
            childLocation.add = childLocation.add.filter(
              (id) => id !== jobToRemove.jobID
            );
          }

          // Add to remove array if not already present
          if (!childLocation.remove.includes(jobToRemove.jobID)) {
            childLocation.remove.push(jobToRemove.jobID);
          }
        } else {
          newChildJobs[jobToRemove.itemID] = {
            add: [],
            remove: [jobToRemove.jobID],
          };
        }
        // Always clear temporary child job when cancelling/removing this link.
        delete newTemporaryChildJobs[jobToRemove.itemID];
      }
      return {
        ...state,
        jobModified: true,
        temporaryChildJobs: newTemporaryChildJobs,
        parentChildToEdit: {
          ...state.parentChildToEdit,
          childJobs: newChildJobs,
        },
      };
    }
    case EDIT_JOB_ACTION_TYPES.ADD_INDUSTRY_ESI_JOBS_FOR_ADDITION:
      const jobsToAdd = Array.isArray(action.payload)
        ? action.payload
        : [action.payload];
      return {
        ...state,
        jobModified: true,
        esiDataToLink: {
          ...state.esiDataToLink,
          industryJobs: {
            ...state.esiDataToLink.industryJobs,
            add: [
              ...new Set([
                ...(state.esiDataToLink.industryJobs.add || []),
                ...jobsToAdd,
              ]),
            ],
            remove: [
              ...new Set(
                (state.esiDataToLink.industryJobs.remove || []).filter(
                  (id) => !jobsToAdd.includes(id)
                )
              ),
            ],
          },
        },
      };
    case EDIT_JOB_ACTION_TYPES.ADD_INDUSTRY_ESI_JOBS_FOR_REMOVAL:
      const jobsToRemove = Array.isArray(action.payload)
        ? action.payload
        : [action.payload];
      return {
        ...state,
        jobModified: true,
        esiDataToLink: {
          ...state.esiDataToLink,
          industryJobs: {
            ...state.esiDataToLink.industryJobs,
            add: [
              ...new Set(
                (state.esiDataToLink.industryJobs.add || []).filter(
                  (id) => !jobsToRemove.includes(id)
                )
              ),
            ],
            remove: [
              ...new Set([
                ...(state.esiDataToLink.industryJobs.remove || []),
                ...jobsToRemove,
              ]),
            ],
          },
        },
      };
    case EDIT_JOB_ACTION_TYPES.ADD_MARKET_ORDERS_FOR_ADDITION:
      const marketOrdersToAdd = Array.isArray(action.payload)
        ? action.payload
        : [action.payload];
      return {
        ...state,
        jobModified: true,
        esiDataToLink: {
          ...state.esiDataToLink,
          marketOrders: {
            ...state.esiDataToLink.marketOrders,
            add: [
              ...new Set([
                ...(state.esiDataToLink.marketOrders.add || []),
                ...marketOrdersToAdd,
              ]),
            ],
            remove: [
              ...new Set(
                (state.esiDataToLink.marketOrders.remove || []).filter(
                  (id) => !marketOrdersToAdd.includes(id)
                )
              ),
            ],
          },
        },
      };
    case EDIT_JOB_ACTION_TYPES.ADD_MARKET_ORDERS_FOR_REMOVAL:
      const marketOrdersToRemove = Array.isArray(action.payload.marketOrders)
        ? action.payload.marketOrders
        : [action.payload.marketOrders];

      const transactionsToRemove = Array.isArray(action.payload.transactions)
        ? action.payload.transactions
        : [action.payload.transactions];

      return {
        ...state,
        jobModified: true,
        esiDataToLink: {
          ...state.esiDataToLink,
          marketOrders: {
            ...state.esiDataToLink.marketOrders,
            add: [
              ...new Set(
                (state.esiDataToLink.marketOrders.add || []).filter(
                  (id) => !marketOrdersToRemove.includes(id)
                )
              ),
            ],
            remove: [
              ...new Set([
                ...(state.esiDataToLink.marketOrders.remove || []),
                ...marketOrdersToRemove,
              ]),
            ],
          },
          transactions: {
            ...state.esiDataToLink.transactions,
            add: [
              ...new Set(
                (state.esiDataToLink.transactions.add || []).filter(
                  (id) => !transactionsToRemove.includes(id)
                )
              ),
            ],
            remove: [
              ...new Set([
                ...(state.esiDataToLink.transactions.remove || []),
                ...transactionsToRemove,
              ]),
            ],
          },
        },
      };
    case EDIT_JOB_ACTION_TYPES.ADD_TRANSACTIONS_FOR_ADDITION:
      const transactionsToAdd = Array.isArray(action.payload)
        ? action.payload
        : [action.payload];

      return {
        ...state,
        jobModified: true,
        esiDataToLink: {
          ...state.esiDataToLink,
          transactions: {
            ...state.esiDataToLink.transactions,
            add: [
              ...new Set([
                ...(state.esiDataToLink.transactions.add || []),
                ...transactionsToAdd,
              ]),
            ],
            remove: [
              ...new Set(
                (state.esiDataToLink.transactions.remove || []).filter(
                  (id) => !transactionsToAdd.includes(id)
                )
              ),
            ],
          },
        },
      };

    case EDIT_JOB_ACTION_TYPES.ADD_TRANSACTIONS_FOR_REMOVAL:
      const transactionsToRemove2 = Array.isArray(action.payload)
        ? action.payload
        : [action.payload];

      return {
        ...state,
        jobModified: true,
        esiDataToLink: {
          ...state.esiDataToLink,
          transactions: {
            ...state.esiDataToLink.transactions,
            add: [
              ...new Set(
                (state.esiDataToLink.transactions.add || []).filter(
                  (id) => !transactionsToRemove2.includes(id)
                )
              ),
            ],
            remove: [
              ...new Set([
                ...(state.esiDataToLink.transactions.remove || []),
                ...transactionsToRemove2,
              ]),
            ],
          },
        },
      };
  }
}

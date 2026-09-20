/**
 * Edit Job Reducer for EVE Industry Planner.
 */

import Job from "../../../Classes/job";
import Transaction from "../../../Classes/transaction";
import { normalizeSetIsLoadingPayload } from "../../../Functions/Helper/setIsLoadingAction";

/**
 * Action types for the edit job reducer. Each names itself, and what it does to
 * the state is at its own `case` below; a second list here only went out of date.
 *
 * @constant {Object} EDIT_JOB_ACTION_TYPES
 */
export const EDIT_JOB_ACTION_TYPES = {
  SET_ACTIVE_JOB: "SET_ACTIVE_JOB",
  UPDATE_ACTIVE_JOB: "UPDATE_ACTIVE_JOB",
  UPDATE_ACTIVE_JOB_LAYOUT: "UPDATE_ACTIVE_JOB_LAYOUT",
  UPDATE_ACTIVE_JOB_PRICING: "UPDATE_ACTIVE_JOB_PRICING",
  TOGGLE_ACTIVE_JOB_READY_FOR_SALE: "TOGGLE_ACTIVE_JOB_READY_FOR_SALE",
  ADD_CUSTOM_TRANSACTION: "ADD_CUSTOM_TRANSACTION",
  STEP_ACTIVE_JOB_FORWARD: "STEP_ACTIVE_JOB_FORWARD",
  STEP_ACTIVE_JOB_BACKWARD: "STEP_ACTIVE_JOB_BACKWARD",
  MARK_JOB_AS_MODIFIED: "MARK_JOB_AS_MODIFIED",
  SET_TEMPORARY_CHILD_JOBS: "SET_TEMPORARY_CHILD_JOBS",
  RECORD_SPECULATIVE_CHILD_JOBS: "RECORD_SPECULATIVE_CHILD_JOBS",
  FORGET_SPECULATIVE_CHILD_JOBS: "FORGET_SPECULATIVE_CHILD_JOBS",
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
    /* Where the reader's choices about the job's own screens are kept. The patch
     * comes from a component, which must not write into the job it was handed. */
    case EDIT_JOB_ACTION_TYPES.UPDATE_ACTIVE_JOB_LAYOUT: {
      if (!state.activeJob) return state;
      return {
        ...state,
        jobModified: true,
        activeJob: new Job({
          ...state.activeJob,
          layout: { ...state.activeJob.layout, ...action.payload },
        }),
      };
    }
    /* The job's own pricing choice — which market and basis each side is read
     * at. A decision the player made, so it sits with the rest of them under
     * `build` rather than with the screen state above. */
    case EDIT_JOB_ACTION_TYPES.UPDATE_ACTIVE_JOB_PRICING: {
      if (!state.activeJob) return state;
      return {
        ...state,
        jobModified: true,
        activeJob: new Job({
          ...state.activeJob,
          build: { ...state.activeJob.build, ...action.payload },
        }),
      };
    }
    /* A sale the reader entered by hand. `Job.addTransaction` is for transactions
     * that came from an ESI order and stamps one onto them, which a manual sale
     * has none of. */
    case EDIT_JOB_ACTION_TYPES.ADD_CUSTOM_TRANSACTION: {
      if (!state.activeJob || !action.payload) return state;
      const next = new Job(state.activeJob);
      const sale = new Transaction(action.payload);
      next.esi.transactions[String(sale.transaction_id)] = sale;
      return { ...state, jobModified: true, activeJob: next };
    }
    case EDIT_JOB_ACTION_TYPES.TOGGLE_ACTIVE_JOB_READY_FOR_SALE: {
      if (!state.activeJob) return state;
      const next = new Job(state.activeJob);
      if (!next.isReadyToSell) {
        next.jobStatus += 1;
      }
      next.toggleGroupJobReadyForSale();
      return { ...state, jobModified: true, activeJob: next };
    }
    case EDIT_JOB_ACTION_TYPES.STEP_ACTIVE_JOB_FORWARD: {
      if (!state.activeJob) return state;
      const next = new Job(state.activeJob);
      next.stepForward();
      return { ...state, jobModified: true, activeJob: next };
    }
    case EDIT_JOB_ACTION_TYPES.STEP_ACTIVE_JOB_BACKWARD: {
      if (!state.activeJob) return state;
      const next = new Job(state.activeJob);
      next.stepBackward();
      return { ...state, jobModified: true, activeJob: next };
    }
    case EDIT_JOB_ACTION_TYPES.MARK_JOB_AS_MODIFIED:
      return { ...state, jobModified: true };
    case EDIT_JOB_ACTION_TYPES.SET_TEMPORARY_CHILD_JOBS:
      return { ...state, temporaryChildJobs: action.payload };
    // Neither of these sets jobModified: costing a row is a question the player
    // asked, not a change to the job. Nothing here is persisted, and a
    // speculative job becomes a real one only by being marked for addition.
    //
    // They merge and delete rather than replacing the map, because rows are
    // costed concurrently — a drawer opening while the summary strip's bulk
    // costing is still resolving. A caller that built the next map from what it
    // had read would write back a base taken before the other finished, and the
    // row costed in between would quietly lose its price.
    case EDIT_JOB_ACTION_TYPES.RECORD_SPECULATIVE_CHILD_JOBS: {
      const costed = { ...state.speculativeChildJobs };
      for (const job of action.payload) costed[job.itemID] = job;
      return { ...state, speculativeChildJobs: costed };
    }
    case EDIT_JOB_ACTION_TYPES.FORGET_SPECULATIVE_CHILD_JOBS: {
      const costed = { ...state.speculativeChildJobs };
      for (const typeID of action.payload) delete costed[typeID];
      return { ...state, speculativeChildJobs: costed };
    }
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
              (id) => id !== action.payload,
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
              (id) => id !== action.payload,
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
              (id) => id !== newJob.jobID,
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
              (id) => id !== jobToRemove.jobID,
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
    case EDIT_JOB_ACTION_TYPES.ADD_INDUSTRY_ESI_JOBS_FOR_ADDITION: {
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
                  (id) => !jobsToAdd.includes(id),
                ),
              ),
            ],
          },
        },
      };
    }
    case EDIT_JOB_ACTION_TYPES.ADD_INDUSTRY_ESI_JOBS_FOR_REMOVAL: {
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
                  (id) => !jobsToRemove.includes(id),
                ),
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
    }
    case EDIT_JOB_ACTION_TYPES.ADD_MARKET_ORDERS_FOR_ADDITION: {
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
                  (id) => !marketOrdersToAdd.includes(id),
                ),
              ),
            ],
          },
        },
      };
    }
    case EDIT_JOB_ACTION_TYPES.ADD_MARKET_ORDERS_FOR_REMOVAL: {
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
                  (id) => !marketOrdersToRemove.includes(id),
                ),
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
                  (id) => !transactionsToRemove.includes(id),
                ),
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
    }
    case EDIT_JOB_ACTION_TYPES.ADD_TRANSACTIONS_FOR_ADDITION: {
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
                  (id) => !transactionsToAdd.includes(id),
                ),
              ),
            ],
          },
        },
      };
    }
    case EDIT_JOB_ACTION_TYPES.ADD_TRANSACTIONS_FOR_REMOVAL: {
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
                  (id) => !transactionsToRemove2.includes(id),
                ),
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
    // An unrecognised action returns the state untouched. Falling out of the
    // switch instead returns undefined, which the reducer stores as the whole
    // state — emptying the page of the job being edited rather than ignoring
    // one dispatch.
    default:
      return state;
  }
}

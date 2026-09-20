/**
 * Edit Job Reducer Hook for EVE Industry Planner.
 *
 * Custom React hook that provides state management for the edit job dialogue component.
 * Uses useReducer with a custom reducer to handle complex state transitions for
 * job editing, parent-child relationships, ESI data linking, and temporary job management.
 */

import { useReducer } from "react";
import { editJobReducer, EDIT_JOB_ACTION_TYPES } from "./editJobReducer";
import { buildSetIsLoadingActionPayload } from "../../../Functions/Helper/setIsLoadingAction";

/**
 * Custom hook for managing edit job dialogue state.
 *
 * @returns {Object} Hook return object
 * @returns {Object} returns.state - Current dialogue state
 * @returns {Object|null} returns.state.activeJob - Currently active job being edited
 * @returns {boolean} returns.state.jobModified - Whether the job has unsaved changes
 * @returns {Object} returns.state.temporaryChildJobs - Temporary child jobs data
 * @returns {Object} returns.state.esiDataToLink - ESI data to be linked to the job
 * @returns {Object} returns.state.parentChildToEdit - Parent-child job relationship changes
 * @returns {boolean} returns.state.isLoading - Loading state
 * @returns {Object} returns.actions - Action dispatchers, each documented where
 *   it is defined. Listing them here as well went out of step twice.
 */
export default function useEditJobReducer() {
  const initialState = {
    activeJob: null,
    jobModified: false,
    temporaryChildJobs: {},
    speculativeChildJobs: {},
    esiDataToLink: {
      industryJobs: { add: [], remove: [] },
      marketOrders: { add: [], remove: [] },
      transactions: { add: [], remove: [] },
    },
    parentChildToEdit: {
      parentJobs: { add: [], remove: [] },
      childJobs: {},
    },
    isLoading: true,
    loadingMessage: undefined,
  };
  const [state, dispatch] = useReducer(editJobReducer, initialState);

  /**
   * Action dispatchers for the edit job dialogue state.
   */
  const actions = {
    /**
     * Sets the active job being edited.
     *
     * @param {Object|null} activeJob - Job object to set as active
     */
    setActiveJob: (activeJob) => {
      dispatch({
        type: EDIT_JOB_ACTION_TYPES.SET_ACTIVE_JOB,
        payload: activeJob,
      });
    },
    /**
     * Updates the active job with new data and marks it as modified.
     *
     * @param {Object} activeJob - Updated job data
     */
    updateActiveJob: (activeJob) => {
      dispatch({
        type: EDIT_JOB_ACTION_TYPES.UPDATE_ACTIVE_JOB,
        payload: activeJob,
      });
    },
    /**
     * Moves the active job status forward and marks it as modified.
     */
    stepActiveJobForward: () => {
      dispatch({
        type: EDIT_JOB_ACTION_TYPES.STEP_ACTIVE_JOB_FORWARD,
      });
    },
    /**
     * Moves the active job status backward and marks it as modified.
     */
    stepActiveJobBackward: () => {
      dispatch({
        type: EDIT_JOB_ACTION_TYPES.STEP_ACTIVE_JOB_BACKWARD,
      });
    },
    /**
     * Marks the job as having unsaved changes.
     */
    markJobAsModified: () => {
      dispatch({
        type: EDIT_JOB_ACTION_TYPES.MARK_JOB_AS_MODIFIED,
      });
    },
    /**
     * Sets the temporary child jobs data.
     *
     * @param {Object} temporaryChildJobs - Temporary child jobs object
     */
    setTemporaryChildJobs: (temporaryChildJobs) => {
      dispatch({
        type: EDIT_JOB_ACTION_TYPES.SET_TEMPORARY_CHILD_JOBS,
        payload: temporaryChildJobs,
      });
    },

    /**
     * Records jobs built to price a row rather than to commit to it. Separate
     * from the temporary ones, which a player has already asked to create.
     *
     * @param {Array<object>|object} jobs - One costed job, or several
     */
    recordSpeculativeChildJobs: (jobs) => {
      dispatch({
        type: EDIT_JOB_ACTION_TYPES.RECORD_SPECULATIVE_CHILD_JOBS,
        payload: Array.isArray(jobs) ? jobs : [jobs],
      });
    },

    /**
     * Drops rows from the costed map, so nothing reads a price for a job that
     * has since been committed or removed.
     *
     * @param {Array<number>|number} typeIDs - One material type id, or several
     */
    forgetSpeculativeChildJobs: (typeIDs) => {
      dispatch({
        type: EDIT_JOB_ACTION_TYPES.FORGET_SPECULATIVE_CHILD_JOBS,
        payload: Array.isArray(typeIDs) ? typeIDs : [typeIDs],
      });
    },

    /**
     * Gets the current parent jobs considering pending changes.
     *
     * Combines the active job's parent jobs with pending additions and
     * removes pending removals to show the current state.
     *
     * @returns {Array} Array of current parent job IDs
     */
    getCurrentParentJobs: () => {
      const activeJobParentJobs = state.activeJob.parentJobs || [];
      const parentJobsToAdd = state.parentChildToEdit.parentJobs.add || [];
      const parentJobsToRemove =
        state.parentChildToEdit.parentJobs.remove || [];

      return [
        ...new Set(
          [...activeJobParentJobs, ...parentJobsToAdd].filter(
            (id) => !parentJobsToRemove.includes(id),
          ),
        ),
      ];
    },

    /**
     * Gets the current child jobs for a specific material type considering pending changes.
     *
     * Combines the active job's child jobs for the material with pending
     * additions and removes pending removals to show the current state.
     *
     * @param {number} materialTypeID - Material type ID to get child jobs for
     * @returns {Array} Array of current child job IDs for the material
     */
    getCurrentMaterialChildJobs: (materialTypeID) => {
      const activeJobChildJobs =
        state.activeJob.build.childJobs[materialTypeID] || [];
      const childJobsToAdd =
        state.parentChildToEdit.childJobs[materialTypeID]?.add || [];
      const childJobsToRemove =
        state.parentChildToEdit.childJobs[materialTypeID]?.remove || [];

      return [
        ...new Set(
          [...activeJobChildJobs, ...childJobsToAdd].filter(
            (id) => !childJobsToRemove.includes(id),
          ),
        ),
      ];
    },

    /**
     * Marks a parent job for addition to the active job.
     *
     * @param {string} parentJobID - ID of the parent job to add
     */
    markParentJobForAddition: (parentJobID) => {
      dispatch({
        type: EDIT_JOB_ACTION_TYPES.MARK_PARENT_JOB_FOR_ADDITION,
        payload: parentJobID,
      });
    },
    /**
     * Marks a parent job for removal from the active job.
     *
     * @param {string} parentJobID - ID of the parent job to remove
     */
    markParentJobForRemoval: (parentJobID) => {
      dispatch({
        type: EDIT_JOB_ACTION_TYPES.MARK_PARENT_JOB_FOR_REMOVAL,
        payload: parentJobID,
      });
    },
    /**
     * Records a change to the reader's layout choices for the active job.
     *
     * @param {Object} layoutPatch - The layout fields that changed.
     */
    updateActiveJobLayout: (layoutPatch) => {
      dispatch({
        type: EDIT_JOB_ACTION_TYPES.UPDATE_ACTIVE_JOB_LAYOUT,
        payload: layoutPatch,
      });
    },
    /**
     * Records a change to the job's own pricing choice.
     *
     * @param {Object} pricingPatch - The build pricing fields that changed.
     */
    updateActiveJobPricing: (pricingPatch) => {
      dispatch({
        type: EDIT_JOB_ACTION_TYPES.UPDATE_ACTIVE_JOB_PRICING,
        payload: pricingPatch,
      });
    },
    /**
     * Records a sale the reader entered by hand.
     *
     * @param {Object} transaction - The transaction as the form built it.
     */
    addCustomTransaction: (transaction) => {
      dispatch({
        type: EDIT_JOB_ACTION_TYPES.ADD_CUSTOM_TRANSACTION,
        payload: transaction,
      });
    },
    /** Marks a grouped job ready for sale, or takes that back. */
    toggleActiveJobReadyForSale: () => {
      dispatch({
        type: EDIT_JOB_ACTION_TYPES.TOGGLE_ACTIVE_JOB_READY_FOR_SALE,
      });
    },
    /**
     * Marks child jobs for addition to the active job.
     *
     * @param {Object|Array} jobsToAdd - Job object or array of job objects to add
     */
    markChildJobsForAddition: (jobsToAdd) => {
      dispatch({
        type: EDIT_JOB_ACTION_TYPES.MARK_CHILD_JOBS_FOR_ADDITION,
        payload: jobsToAdd,
      });
    },
    /**
     * Marks child jobs for removal from the active job.
     *
     * @param {Object|Array} jobsToRemove - Job object or array of job objects to remove
     */
    markChildJobsForRemoval: (jobsToRemove) => {
      dispatch({
        type: EDIT_JOB_ACTION_TYPES.MARK_CHILD_JOBS_FOR_REMOVAL,
        payload: jobsToRemove,
      });
    },

    /**
     * Sets the loading state.
     *
     * @param {boolean} isLoading - Loading state value
     * @param {string} [loadingMessage] - Optional caption while loading
     */
    setIsLoading: (isLoading, loadingMessage) => {
      dispatch({
        type: EDIT_JOB_ACTION_TYPES.SET_IS_LOADING,
        payload: buildSetIsLoadingActionPayload(isLoading, loadingMessage),
      });
    },

    /**
     * Adds ESI industry jobs for linking to the active job.
     *
     * @param {string|Array} jobIDs - Job ID or array of job IDs to add
     */
    addIndustryESIJobsForAddition: (jobIDs) => {
      dispatch({
        type: EDIT_JOB_ACTION_TYPES.ADD_INDUSTRY_ESI_JOBS_FOR_ADDITION,
        payload: jobIDs,
      });
    },
    /**
     * Removes ESI industry jobs from linking to the active job.
     *
     * @param {string|Array} jobIDs - Job ID or array of job IDs to remove
     */
    addIndustryESIJobsForRemoval: (jobIDs) => {
      dispatch({
        type: EDIT_JOB_ACTION_TYPES.ADD_INDUSTRY_ESI_JOBS_FOR_REMOVAL,
        payload: jobIDs,
      });
    },

    /**
     * Adds market orders for linking to the active job.
     *
     * @param {Object|Array} marketOrders - Market order object or array to add
     */
    addMarketOrdersForAddition: (marketOrders) => {
      dispatch({
        type: EDIT_JOB_ACTION_TYPES.ADD_MARKET_ORDERS_FOR_ADDITION,
        payload: marketOrders,
      });
    },

    /**
     * Removes market orders from linking to the active job.
     *
     * Also removes associated transactions when market orders are removed.
     *
     * @param {Object|Array} marketOrders - Market order object or array to remove
     * @param {Object|Array} transactions - Associated transaction object or array
     */
    addMarketOrdersForRemoval: (marketOrders, transactions) => {
      dispatch({
        type: EDIT_JOB_ACTION_TYPES.ADD_MARKET_ORDERS_FOR_REMOVAL,
        payload: { marketOrders, transactions },
      });
    },

    /**
     * Adds transactions for linking to the active job.
     *
     * @param {Object|Array} transactions - Transaction object or array to add
     */
    addTransactionsForAddition: (transactions) => {
      dispatch({
        type: EDIT_JOB_ACTION_TYPES.ADD_TRANSACTIONS_FOR_ADDITION,
        payload: transactions,
      });
    },

    /**
     * Removes transactions from linking to the active job.
     *
     * @param {Object|Array} transactions - Transaction object or array to remove
     */
    addTransactionsForRemoval: (transactions) => {
      dispatch({
        type: EDIT_JOB_ACTION_TYPES.ADD_TRANSACTIONS_FOR_REMOVAL,
        payload: transactions,
      });
    },
  };

  return { state, actions };
}

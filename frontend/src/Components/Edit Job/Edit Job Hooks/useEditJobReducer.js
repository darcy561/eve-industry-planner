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
 * @returns {Object} returns.actions - Action dispatchers
 * @returns {Function} returns.actions.setActiveJob - Set the active job
 * @returns {Function} returns.actions.updateActiveJob - Update the active job
 * @returns {Function} returns.actions.stepActiveJobForward - Move job status forward
 * @returns {Function} returns.actions.stepActiveJobBackward - Move job status backward
 * @returns {Function} returns.actions.markJobAsModified - Mark job as modified
 * @returns {Function} returns.actions.setTemporaryChildJobs - Set temporary child jobs
 * @returns {Function} returns.actions.getCurrentParentJobs - Get current parent jobs
 * @returns {Function} returns.actions.getCurrentMaterialChildJobs - Get child jobs for material
 * @returns {Function} returns.actions.markParentJobForAddition - Mark parent job for addition
 * @returns {Function} returns.actions.markParentJobForRemoval - Mark parent job for removal
 * @returns {Function} returns.actions.markChildJobsForAddition - Mark child jobs for addition
 * @returns {Function} returns.actions.markChildJobsForRemoval - Mark child jobs for removal
 * @returns {Function} returns.actions.setIsLoading - Set loading state
 * @returns {Function} returns.actions.addIndustryESIJobsForAddition - Add ESI industry jobs
 * @returns {Function} returns.actions.addIndustryESIJobsForRemoval - Remove ESI industry jobs
 * @returns {Function} returns.actions.addMarketOrdersForAddition - Add market orders
 * @returns {Function} returns.actions.addMarketOrdersForRemoval - Remove market orders
 * @returns {Function} returns.actions.addTransactionsForAddition - Add transactions
 * @returns {Function} returns.actions.addTransactionsForRemoval - Remove transactions
 */
export default function useEditJobReducer() {
  const initialState = {
    activeJob: null,
    jobModified: false,
    temporaryChildJobs: {},
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
            (id) => !parentJobsToRemove.includes(id)
          )
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
            (id) => !childJobsToRemove.includes(id)
          )
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

  }

  return { state, actions };
}

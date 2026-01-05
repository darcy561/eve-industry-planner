/**
 * Multi-Selection Management for EVE Industry Planner.
 * 
 * Handles multi-selection operations including adding, removing, and clearing
 * selected job/group IDs. Provides methods for managing multi-selection state
 * and selection operations.
 * 
 * @fileoverview Multi-selection management operations
 * @author EVE Industry Planner Team
 */

/**
 * Multi-selection management actions for jobs slice.
 * 
 * Provides methods for managing multi-selection including adding, removing,
 * and clearing selected items.
 * 
 * @param {Function} set - Zustand set function for updating state
 * @param {Function} get - Zustand get function for accessing current state
 * @returns {Object} Multi-selection management actions
 */
export const multiSelectionActions = (set, get) => ({
  /**
   * Adds IDs to the multi-selection array.
   * 
   * Accepts single IDs, arrays of IDs, or Sets of IDs and adds them
   * to the current multi-selection, removing duplicates.
   * 
   * @param {string|number|Array|Set} ids - ID(s) to add to multi-selection
   * 
   * @example
   * store.getState().jobData.actions.addToMultiSelect('job-123');
   * store.getState().jobData.actions.addToMultiSelect(['job-123', 'job-456']);
   * store.getState().jobData.actions.addToMultiSelect(new Set(['job-123', 'job-456']));
   */
  addToMultiSelect: (ids) => {
    if (!ids) return;
    
    const idsArray = Array.isArray(ids) || ids instanceof Set ? [...ids] : [ids];
    
    set(
      (state) => ({
        ...state,
        jobData: {
          ...state.jobData,
          multiSelect: [...new Set([...state.jobData.multiSelect, ...idsArray])],
        },
      }),
      false,
      "addToMultiSelect"
    );
  },

  /**
   * Removes IDs from the multi-selection array.
   * 
   * Accepts single IDs, arrays of IDs, or Sets of IDs and removes them
   * from the current multi-selection.
   * 
   * @param {string|number|Array|Set} ids - ID(s) to remove from multi-selection
   * 
   * @example
   * store.getState().jobData.actions.removeFromMultiSelect('job-123');
   * store.getState().jobData.actions.removeFromMultiSelect(['job-123', 'job-456']);
   */
  removeFromMultiSelect: (ids) => {
    if (!ids) return;
    
    const idsArray = Array.isArray(ids) || ids instanceof Set ? [...ids] : [ids];
    
    set(
      (state) => ({
        ...state,
        jobData: {
          ...state.jobData,
          multiSelect: state.jobData.multiSelect.filter(id => !idsArray.includes(id)),
        },
      }),
      false,
      "removeFromMultiSelect"
    );
  },

  /**
   * Clears the multi-selection array.
   * 
   * Removes all selected IDs from the multi-selection.
   * 
   * @example
   * store.getState().jobData.actions.clearMultiSelect();
   */
  clearMultiSelect: () => {
    set(
      (state) => ({
        ...state,
        jobData: {
          ...state.jobData,
          multiSelect: [],
        },
      }),
      false,
      "clearMultiSelect"
    );
  },
});

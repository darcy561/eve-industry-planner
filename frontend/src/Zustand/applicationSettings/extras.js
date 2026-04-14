/**
 * Extras Management for EVE Industry Planner.
 * 
 * Handles management of extra cost categories and predefined system indexes.
 * Provides methods for adding, removing, updating, and finding extras categories
 * and system cost indexes used in job calculations.
 * 
 * @fileoverview Extras categories and system indexes management actions
 * @author EVE Industry Planner Team
 */

/**
 * Extras management actions for application settings.
 * 
 * Provides methods for managing extras categories and predefined system indexes
 * including CRUD operations and search functionality.
 * 
 * @param {Function} set - Zustand set function for updating state
 * @param {Function} get - Zustand get function for accessing current state
 * @returns {Object} Extras management actions
 */
import { permanentExtrasCategories } from "../../Context/defaultValues";

export const extrasActions = (set, get) => ({
  /**
   * Adds an extra category to the extras categories array.
   * 
   * @param {Object} category - Extra category object to add
   * @param {string} category.id - Category identifier
   * @param {string} category.name - Category name
   * @param {number} [category.cost] - Category cost
   * 
   * @example
   * const newCategory = {
   *   id: 'category-1',
   *   name: 'Transportation',
   *   cost: 1000000
   * };
   * store.getState().applicationSettings.actions.addExtraCategory(newCategory);
   */
  addExtraCategory: (category) =>
    set(
      (state) => ({
        ...state,
        applicationSettings: {
          ...state.applicationSettings,
          extrasCategories: [
            ...state.applicationSettings.extrasCategories,
            category,
          ],
        },
      }),
      false,
      "addExtraCategory"
    ),

  /**
   * Removes an extra category from the extras categories array.
   * 
   * @param {Object} category - Extra category object to remove
   * @param {string} category.id - Category identifier to match for removal
   * 
   * @example
   * const categoryToRemove = { id: 'category-1', name: 'Transportation' };
   * store.getState().applicationSettings.actions.removeExtraCategory(categoryToRemove);
   */
  removeExtraCategory: (category) =>
    set(
      (state) => ({
        ...state,
        applicationSettings: {
          ...state.applicationSettings,
          extrasCategories: state.applicationSettings.extrasCategories.filter((c) => c.id !== category.id)
        },
      }),
      false,
      "removeExtraCategory"
    ),

  /**
   * Updates the predefined system indexes object by merging new data.
   * 
   * Merges new system index data with existing predefined system indexes,
   * preserving all existing data while adding or updating the new entries.
   * 
   * @param {Object} newIndexes - New predefined system indexes to merge
   * @param {Object} newIndexes[systemID] - System index data for each system ID
   * @param {number} newIndexes[systemID][indexType] - Index value for specific activity type
   * 
   * @example
   * const newIndexes = {
   *   30000142: { manufacturing: 0.0125, invention: 0.0150 }, // Jita system indexes
   *   30002187: { manufacturing: 0.0100 } // Amarr system index
   * };
   * store.getState().applicationSettings.actions.updatePredefinedSystemIndexes(newIndexes);
   */
  updatePredefinedSystemIndexes: (newIndexes) =>
    set(
      (state) => {
        const mergedIndexes = { ...state.applicationSettings.predefinedSystemIndexes };

        // Merge each system's data
        Object.entries(newIndexes).forEach(([systemID, systemData]) => {
          mergedIndexes[systemID] = {
            ...mergedIndexes[systemID], // Preserve existing activity types for this system
            ...systemData // Add/update new activity types
          };
        });

        return {
          ...state,
          applicationSettings: {
            ...state.applicationSettings,
            predefinedSystemIndexes: mergedIndexes
          },
        };
      },
      false,
      "updatePredefinedSystemIndexes"
    ),

  /**
   * Finds a predefined system index by system ID.
   * 
   * @param {number} systemID - System ID to search for
   * @returns {number|undefined} System cost index or undefined if not found
   * 
   * @example
   * const systemIndex = store.getState().applicationSettings.actions.findPredefinedSystemIndex(30000142);
   * if (systemIndex !== undefined) console.log('Jita system index:', systemIndex);
   */
  findPredefinedSystemIndex: (systemID) => {
    const state = get().applicationSettings;
    return state.predefinedSystemIndexes[systemID];
  },

  /**
   * Deletes a specific index type from a predefined system index.
   * 
   * Removes a specific index type from a system's predefined indexes.
   * If no more index types remain for the system, removes the entire system.
   * 
   * @param {number} systemID - System ID to remove index type from
   * @param {string} indexType - Index type to remove from predefined indexes
   * 
   * @example
   * store.getState().applicationSettings.actions.deletePredefinedSystemIndexType(30000142, "manufacturing");
   */
  deletePredefinedSystemIndexType: (systemID, indexType) =>
    set(
      (state) => {
        const newIndexes = { ...state.applicationSettings.predefinedSystemIndexes };
        const currentSystemData = newIndexes[systemID];

        // Return early if system doesn't exist
        if (!currentSystemData) return state;

        // Remove the specific index type from the system
        const updatedSystemData = { ...currentSystemData };
        delete updatedSystemData[indexType];

        // If no more index types remain, remove the entire system
        if (Object.keys(updatedSystemData).length === 0) {
          delete newIndexes[systemID];
        } else {
          // Update the system with remaining index types
          newIndexes[systemID] = updatedSystemData;
        }

        return {
          ...state,
          applicationSettings: {
            ...state.applicationSettings,
            predefinedSystemIndexes: newIndexes
          },
        };
      },
      false,
      "deletePredefinedSystemIndexType"
    ),

  /**
   * Finds an extras category by category ID.
   * 
   * @param {string} categoryID - Category ID to search for
   * @returns {Object|undefined} Extras category object or undefined if not found
   * 
   * @example
   * const category = store.getState().applicationSettings.actions.findExtrasCategory('category-1');
   * if (category) console.log('Found category:', category.name);
   */
  findExtrasCategory: (categoryID) => {
    const state = get().applicationSettings;
    return state.extrasCategories.find((c) => c.id === categoryID);
  },

  /**
   * Adds an extras category to the extras categories array.
   * 
   * 
   * @param {Object} category - Extras category object to add
   * @param {string} category.id - Category identifier
   * @param {string} category.label - Category label
   * 
   * @example
   * const newCategory = {
   *   id: 'category-2',
   *   label: 'Insurance',
   * };
   * store.getState().applicationSettings.actions.addExtrasCategory(newCategory);
   */
  addExtrasCategory: (category) =>
    set(
      (state) => ({
        ...state,
        applicationSettings: {
          ...state.applicationSettings,
          extrasCategories: [
            ...state.applicationSettings.extrasCategories,
            category,
          ],
        },
      }),
      false,
      "addExtrasCategory"
    ),

  /**
   * Removes an extras category by category ID.
   * 
   * @param {string} categoryID - Category ID to remove
   * 
   * @example
   * store.getState().applicationSettings.actions.removeExtrasCategory('category-1');
   */
  markExtrasCategoryAsDeleted: (categoryID) => {
    if (permanentExtrasCategories.has(categoryID)) return

    const state = get().applicationSettings;
    const category = state.extrasCategories.find((c) => c.id === categoryID);

    if (!category) return;

    category.deleted = true;
    category.deletedAt = new Date().toISOString();

    set(
      (state) => ({
        ...state,
        applicationSettings: {
          ...state.applicationSettings,
          extrasCategories: [...state.applicationSettings.extrasCategories]
        },
      }),

      false,
      "markExtrasCategoryAsDeleted"
    )
  },
  unmarkExtrasCategoryAsDeleted: (categoryID) => {
    if (permanentExtrasCategories.has(categoryID)) return

    const state = get().applicationSettings;
    const category = state.extrasCategories.find((c) => c.id === categoryID);

    if (!category) return;

    category.deleted = false;
    category.deletedAt = null;

    set(
      (state) => ({
        ...state,
        applicationSettings: {
          ...state.applicationSettings,
          extrasCategories: [...state.applicationSettings.extrasCategories]
        },
      }),
      false,
      "unmarkExtrasCategoryAsDeleted"
    )
  },
});

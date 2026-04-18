import { eventEmitter } from "../utils/EventSystem";

/**
 * Shows the shopping list dialog with specified job IDs.
 * Emits an event to display the shopping list for the given jobs.
 * 
 * @param {Array<string>} [jobIDs=[]] - Array of job IDs to include in the shopping list
 * @returns {void}
 * 
 * @example
 * showShoppingList(["job_123", "job_456"]); // Shows shopping list for specific jobs
 * 
 * @example
 * showShoppingList(); // Shows empty shopping list
 */
export function showShoppingList(jobIDs = []) {
  eventEmitter.emit("shoppingList", {
    isOpen: true,
    jobIDs,
  });
}

/**
 * Hides the shopping list dialog.
 * Emits an event to close the shopping list dialog.
 * 
 * @returns {void}
 * 
 * @example
 * hideShoppingList(); // Closes the shopping list dialog
 */
export function hideShoppingList() {
  eventEmitter.emit("shoppingList", {
    isOpen: false,
    jobIDs: [],
  });
} 
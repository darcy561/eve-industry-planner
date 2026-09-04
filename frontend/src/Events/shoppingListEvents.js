import { eventEmitter } from "../utils/EventSystem";

/**
 * Shows the shopping list dialogue with specified job IDs.
 * Emits an event to display the shopping list for the given jobs.
 *
 * @param {Array<string>} [jobIDs=[]] - Array of job IDs to include in the shopping list
 * @returns {void}
 */
export function showShoppingList(jobIDs = []) {
  eventEmitter.emit("shoppingList", {
    isOpen: true,
    jobIDs,
  });
}

/**
 * Hides the shopping list dialogue.
 * Emits an event to close the shopping list dialogue.
 *
 * @returns {void}
 */
export function hideShoppingList() {
  eventEmitter.emit("shoppingList", {
    isOpen: false,
    jobIDs: [],
  });
} 
import { eventEmitter } from "../utils/EventSystem";

/**
 * Shows mass build feedback dialog with current progress information.
 * Emits an event to display progress information during mass build operations.
 * 
 * @param {number} [currentJob=0] - Current job number being processed
 * @param {number} [totalJob=0] - Total number of jobs to process
 * @param {number} [totalPrice=0] - Total price of all jobs being built
 * @returns {void}
 * 
 * @example
 * showMassBuildFeedback(5, 20, 1500000); // Shows progress: 5/20 jobs, total price 1.5M ISK
 * 
 * @example
 * showMassBuildFeedback(); // Shows empty progress dialog
 */
export function showMassBuildFeedback(currentJob = 0, totalJob = 0, totalPrice = 0) {
  eventEmitter.emit("massBuildFeedback", {
    open: true,
    currentJob,
    totalJob,
    totalPrice,
  });
}

/**
 * Hides the mass build feedback dialog.
 * Emits an event to close the mass build progress dialog.
 * 
 * @returns {void}
 * 
 * @example
 * hideMassBuildFeedback(); // Closes the mass build progress dialog
 */
export function hideMassBuildFeedback() {
  eventEmitter.emit("massBuildFeedback", {
    open: false,
    currentJob: 0,
    totalJob: 0,
    totalPrice: 0,
  });
} 
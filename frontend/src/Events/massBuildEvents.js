import { eventEmitter } from "../utils/EventSystem";

/**
 * Shows mass build feedback dialog with current progress information.
 * Emits an event to display progress information during mass build operations.
 * 
 * @param {number} [currentJob=0] - Current job number being processed
 * @param {number} [totalJob=0] - Total number of jobs to process
 * @param {number} [totalItems=0] - Total number of material jobs/items in this build step
 * @returns {void}
 * 
 * @example
 * showMassBuildFeedback(5, 20, 20); // Shows progress: 5/20 jobs, total items 20
 * 
 * @example
 * showMassBuildFeedback(); // Shows empty progress dialog
 */
export function showMassBuildFeedback(currentJob = 0, totalJob = 0, totalItems = 0) {
  eventEmitter.emit("massBuildFeedback", {
    open: true,
    currentJob,
    totalJob,
    totalItems,
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
    totalItems: 0,
  });
} 
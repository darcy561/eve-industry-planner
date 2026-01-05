import { eventEmitter } from '../utils/EventSystem';

/**
 * Shows the price entry dialog for specified job IDs with market and order display options.
 * Emits an event to display the price entry dialog for manual price input.
 * 
 * @param {Array<string>} jobIDs - Array of job IDs to show price entry for
 * @param {string|null} [displayMarket=null] - Market location to display (e.g., "jita", "amarr")
 * @param {string|null} [displayOrder=null] - Order type to display ("buy" or "sell")
 * @returns {void}
 * 
 * @example
 * showPriceEntryDialog(["job_123", "job_456"], "jita", "sell");
 * 
 * @example
 * showPriceEntryDialog(["job_123"]); // Shows price entry without market/order presets
 */
export function showPriceEntryDialog(jobIDs, displayMarket = null, displayOrder = null) {
  eventEmitter.emit("priceEntry", {
    open: true,
    jobIDs,
    displayMarket,
    displayOrder
  });
}

/**
 * Hides the price entry dialog.
 * Emits an event to close the price entry dialog.
 * 
 * @returns {void}
 * 
 * @example
 * hidePriceEntryDialog(); // Closes the price entry dialog
 */
export function hidePriceEntryDialog() {
  eventEmitter.emit("priceEntry", {
    open: false,
    jobIDs: [],
    displayMarket: null,
    displayOrder: null
  });
} 
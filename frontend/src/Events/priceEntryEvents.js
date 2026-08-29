import { eventEmitter } from '../utils/EventSystem';

/**
 * Shows the price entry dialogue for specified job IDs with market and order display options.
 * Emits an event to display the price entry dialogue for manual price input.
 * 
 * @param {Array<string>} jobIDs - Array of job IDs to show price entry for
 * @param {string|null} [displayMarket=null] - Market location to display (e.g., "jita", "amarr")
 * @param {string|null} [displayOrder=null] - Order type to display ("buy" or "sell")
 * @returns {void}
 * 
 * @example
 * showPriceEntryDialogue(["job_123", "job_456"], "jita", "sell");
 * 
 * @example
 * showPriceEntryDialogue(["job_123"]); // Shows price entry without market/order presets
 */
export function showPriceEntryDialogue(jobIDs, displayMarket = null, displayOrder = null) {
  eventEmitter.emit("priceEntry", {
    isOpen: true,
    jobIDs,
    displayMarket,
    displayOrder
  });
}

/**
 * Hides the price entry dialogue.
 * Emits an event to close the price entry dialogue.
 * 
 * @returns {void}
 * 
 * @example
 * hidePriceEntryDialogue(); // Closes the price entry dialogue
 */
export function hidePriceEntryDialogue() {
  eventEmitter.emit("priceEntry", {
    isOpen: false,
    jobIDs: [],
    displayMarket: null,
    displayOrder: null
  });
} 
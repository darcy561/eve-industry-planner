import { eventEmitter } from '../utils/EventSystem';

/**
 * Shows the price entry dialogue for specified job IDs with market and order display options.
 * Emits an event to display the price entry dialogue for manual price input.
 *
 * @param {Array<string>} jobIDs - Array of job IDs to show price entry for
 * @param {string|null} [displayMarket=null] - Market location to display (e.g., "jita", "amarr")
 * @param {string|null} [displayOrder=null] - Order type to display ("buy" or "sell")
 * @returns {void}
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
 */
export function hidePriceEntryDialogue() {
  eventEmitter.emit("priceEntry", {
    isOpen: false,
    jobIDs: [],
    displayMarket: null,
    displayOrder: null
  });
} 
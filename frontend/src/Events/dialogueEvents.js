import { eventEmitter } from "../utils/EventSystem";

/**
 * Shows the price history dialogue for a specific item and region.
 * Emits an event to display price history data for the specified item.
 * 
 * @param {number|null} [typeID=null] - EVE Online item type ID to show price history for
 * @param {number|null} [regionID=null] - EVE Online region ID to show price history for
 * @returns {void}
 * 
 * @example
 * showPriceHistoryDialogue(34, 10000002); // Shows price history for Tritanium in The Forge
 * 
 * @example
 * showPriceHistoryDialogue(); // Shows empty price history dialogue
 */
export function showPriceHistoryDialogue(typeID = null, regionID = null) {
  eventEmitter.emit("showPriceHistoryDialogue", {
    isOpen: true,
    selectedTypeID: typeID,
    selectedLocation: regionID,
  });
}

/**
 * Shows the market data dialogue for a specific item and location.
 * Emits an event to display market data for the specified item.
 * 
 * @param {number|null} [typeID=null] - EVE Online item type ID to show market data for
 * @param {number|null} [locationID=null] - EVE Online location ID to show market data for
 * @returns {void}
 * 
 * @example
 * showMarketDataDialogue(34, 60003760); // Shows market data for Tritanium in Jita
 * 
 * @example
 * showMarketDataDialogue(); // Shows empty market data dialogue
 */
export function showMarketDataDialogue(typeID = null, locationID = null) {
  eventEmitter.emit("showMarketDataDialogue", {
    isOpen: true,
    selectedTypeID: typeID,
    selectedLocation: locationID,
  });
}

/**
 * Shows the assets dialogue for a specific item.
 * Emits an event to display asset information for the specified item.
 * 
 * @param {number|null} [typeID=null] - EVE Online item type ID to show assets for
 * @returns {void}
 * 
 * @example
 * showAssetsDialogue(34); // Shows assets for Tritanium
 * 
 * @example
 * showAssetsDialogue(); // Shows empty assets dialogue
 */
export function showAssetsDialogue(typeID = null) {
  eventEmitter.emit("showAssetsDialogue", {
    isOpen: true,
    selectedTypeID: typeID,
  });
}

/**
 * Shows archived build statistics for a blueprint product type (backend statistics API).
 *
 * @param {number|null} [typeID=null] - Product / output item type ID (same as blueprint index `itemID`)
 * @param {string|null} [displayName=null] - Optional title label (e.g. blueprint name from search index)
 */
export function showBlueprintArchiveDialogue(typeID = null, displayName = null) {
  eventEmitter.emit("showBlueprintArchiveDialogue", {
    isOpen: true,
    selectedTypeID: typeID,
    displayName: displayName ?? "",
  });
}

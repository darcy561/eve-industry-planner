import { eventEmitter } from "../utils/EventSystem";

/**
 * Shows the price history dialog for a specific item and region.
 * Emits an event to display price history data for the specified item.
 * 
 * @param {number|null} [typeID=null] - EVE Online item type ID to show price history for
 * @param {number|null} [regionID=null] - EVE Online region ID to show price history for
 * @returns {void}
 * 
 * @example
 * showPriceHistoryDialog(34, 10000002); // Shows price history for Tritanium in The Forge
 * 
 * @example
 * showPriceHistoryDialog(); // Shows empty price history dialog
 */
export function showPriceHistoryDialog(typeID = null, regionID = null) {
  eventEmitter.emit("showPriceHistoryDialog", {
    isOpen: true,
    selectedTypeID: typeID,
    selectedLocation: regionID,
  });
}

/**
 * Shows the market data dialog for a specific item and location.
 * Emits an event to display market data for the specified item.
 * 
 * @param {number|null} [typeID=null] - EVE Online item type ID to show market data for
 * @param {number|null} [locationID=null] - EVE Online location ID to show market data for
 * @returns {void}
 * 
 * @example
 * showMarketDataDialog(34, 60003760); // Shows market data for Tritanium in Jita
 * 
 * @example
 * showMarketDataDialog(); // Shows empty market data dialog
 */
export function showMarketDataDialog(typeID = null, locationID = null) {
  eventEmitter.emit("showMarketDataDialog", {
    isOpen: true,
    selectedTypeID: typeID,
    selectedLocation: locationID,
  });
}

/**
 * Shows the assets dialog for a specific item.
 * Emits an event to display asset information for the specified item.
 * 
 * @param {number|null} [typeID=null] - EVE Online item type ID to show assets for
 * @returns {void}
 * 
 * @example
 * showAssetsDialog(34); // Shows assets for Tritanium
 * 
 * @example
 * showAssetsDialog(); // Shows empty assets dialog
 */
export function showAssetsDialog(typeID = null) {
  eventEmitter.emit("showAssetsDialog", {
    isOpen: true,
    selectedTypeID: typeID,
  });
}

import uuid from "react-uuid";

/**
 * WatchlistItem class for tracking items in EVE Online industry watchlists.
 * 
 * This class represents a single item in a watchlist for:
 * - Item tracking and monitoring
 * - Group organization and categorization
 * - Quantity tracking for market monitoring
 * - Version tracking for data compatibility
 * 
 * The WatchlistItem class provides simple item tracking:
 * - Unique item identification
 * - Type ID and name tracking
 * - Group association for organization
 * - Quantity monitoring for market analysis
 * - Version tracking for future compatibility
 * 
 * @class WatchlistItem
 * @example
 * // Create a new watchlist item
 * const item = new WatchlistItem({
 *   typeID: 34,
 *   name: 'Tritanium',
 *   quantity: 1000,
 *   watchlistGroup: 1
 * });
 * 
 * @example
 * // Create from existing data
 * const item = new WatchlistItem(existingItemData);
 */
class WatchlistItem {
  /**
   * Creates a new WatchlistItem instance.
   * 
   * @param {Object} data - Item data object
   * @param {string} [data.id] - Item ID
   * @param {number} [data.version] - Version number
   * @param {number} data.typeID - EVE Online type ID
   * @param {number} [data.watchlistGroup] - Watchlist group ID
   * @param {string} data.name - Item name
   * @param {number} data.quantity - Quantity to track
   */
  constructor(data) {
    this.id = data?.id || uuid();
    this.version = data?.version || 2;
    this.typeID = data?.typeID;
    this.watchlistGroup = data?.watchlistGroup || 0;
    this.name = data?.name;
    this.quantity = data?.quantity;
  }
}

export default WatchlistItem;

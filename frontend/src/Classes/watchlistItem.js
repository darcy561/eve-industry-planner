import uuid from "react-uuid";

/**
 * WatchlistItem class for tracking items in EVE Online industry watchlists.
 *
 * The WatchlistItem class provides simple item tracking:
 *
 * @class WatchlistItem
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

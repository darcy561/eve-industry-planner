import uuid from "react-uuid";

/**
 * WatchlistGroup class for organising watchlist items in EVE Online industry planning.
 *
 * The WatchlistGroup class provides simple group management:
 *
 * @class WatchlistGroup
 */
class WatchlistGroup {
  /**
   * Creates a new WatchlistGroup instance.
   *
   * @param {Object} data - Group data object
   * @param {string} [data.id] - Group ID
   * @param {string} [data.name] - Group name
   * @param {boolean} [data.expanded] - Whether group is expanded
   * @param {number} [data.version] - Version number
   * @param {string} [documentID] - Document ID for storage
   */
  constructor(data, documentID) {
    this.id = data?.id || uuid();
    this.name = data?.name ?? "Unnamed Group";
    this.expanded = data?.expanded ?? true;
    this.version = data?.version ?? 1;
    this.documentID = documentID ?? null
  }

  /**
   * Converts the group to a document object for storage.
   *
   * @returns {Object} Document object ready for storage
   */
  toDocument() {
    return {
      id: this.id,
      name: this.name,
      expanded: this.expanded,
    };
  }
}
export default WatchlistGroup;

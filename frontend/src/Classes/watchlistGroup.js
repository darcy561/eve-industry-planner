import uuid from "react-uuid";

/**
 * WatchlistGroup class for organising watchlist items in EVE Online industry planning.
 * 
 * This class represents a group for organising watchlist items:
 * - Item organisation and categorisation
 * - Group expansion state management
 * - Version tracking for data compatibility
 * - Document storage and retrieval
 * 
 * The WatchlistGroup class provides simple group management:
 * - Unique group identification
 * - Group name management
 * - Expansion state for UI display
 * - Version tracking for future compatibility
 * - Document serialisation for storage
 * 
 * @class WatchlistGroup
 * @example
 * // Create a new watchlist group
 * const group = new WatchlistGroup({
 *   name: 'High Sec Manufacturing',
 *   expanded: true
 * });
 * 
 * @example
 * // Create from existing data
 * const group = new WatchlistGroup(existingData, documentID);
 * 
 * @example
 * // Convert to document for storage
 * const doc = group.toDocument();
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

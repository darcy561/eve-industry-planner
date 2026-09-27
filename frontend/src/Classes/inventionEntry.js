/**
 * One thing invention consumed for a job — a datacore, a decryptor — and what
 * it cost.
 *
 * @class InventionEntry
 */
class InventionEntry {
  /**
   * The shape a row written today has. `models.InventionEntrySchemaCurrent` is
   * the same number on the backend, and both sides read a row carrying none as
   *
   * @type {number}
   */
  static SCHEMA_CURRENT = 1;

  /**
   * @param {Object} [row] - An invention entry from a job document
   */
  constructor(row) {
    this.version = row?.version || 1;
    this.id = row?.id ?? null;
    this.itemName = row?.itemName ?? "";
    this.itemCost = row?.itemCost ?? 0;
  }

  /**
   * Builds an entry for something invention used, minting its id.
   *
   * @param {string} itemName - What was consumed
   * @param {number} itemCost - What it cost
   * @returns {InventionEntry}
   */
  static forItem(itemName, itemCost) {
    return new InventionEntry({
      version: InventionEntry.SCHEMA_CURRENT,
      id: InventionEntry.mintID(),
      itemName,
      itemCost,
    });
  }

  /**
   * Mints an id for a new entry.
   *
   * @returns {string}
   */
  static mintID() {
    return crypto.randomUUID();
  }

  /**
   * Converts the entry to its document shape for storage.
   *
   * @returns {Object} Document object ready for storage
   */
  toDocument() {
    return {
      version: this.version,
      id: this.id,
      itemName: this.itemName,
      itemCost: this.itemCost,
    };
  }
}

export default InventionEntry;

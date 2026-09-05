/**
 * One thing invention consumed for a job — a datacore, a decryptor — and what
 * it cost.
 *
 * The same fields are `models.InventionEntry` on the backend, and
 * {@link InventionEntry#toDocument} defines the shape for the SPA. `id` is
 * minted from the clock when the entry is added, and only ever identifies the
 * row within its job.
 *
 * @class InventionEntry
 */
class InventionEntry {
  /**
   * @param {Object} [row] - An invention entry from a job document
   */
  constructor(row) {
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
      id: InventionEntry.mintID(),
      itemName,
      itemCost,
    });
  }

  /**
   * Mints an id for a new entry.
   *
   * @returns {number} A millisecond timestamp, which is what the rows hold
   */
  static mintID() {
    return Date.now();
  }

  /**
   * Converts the entry to its document shape for storage.
   *
   * @returns {Object} Document object ready for storage
   */
  toDocument() {
    return {
      id: this.id,
      itemName: this.itemName,
      itemCost: this.itemCost,
    };
  }
}

export default InventionEntry;

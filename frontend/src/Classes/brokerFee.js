/**
 * What listing and selling one market order costs.
 *
 * @class BrokerFee
 */
class BrokerFee {
  /**
   * @param {Object} [row] - A broker fee row from a job document
   */
  constructor(row) {
    this.order_id = row?.order_id ?? null;
    this.id = row?.id ?? null;
    this.date = row?.date ?? null;
    this.amount = row?.amount ?? 0;
    this.salesTax = row?.salesTax ?? 0;
  }

  /**
   * Builds a fee from the wallet journal entry that charged it.
   *
   * @param {Object} [entry] - The journal entry charging it, when found
   * @param {Object} order - The order the fee was charged for
   * @param {number} amount - What the listing cost
   * @param {number} [salesTax] - What the sale is expected to be taxed
   * @returns {BrokerFee}
   */
  static fromJournalEntry(entry, order, amount, salesTax = 0) {
    return new BrokerFee({
      order_id: order?.order_id ?? null,
      id: entry?.id ?? null,
      date: entry?.date ?? order?.issued ?? null,
      amount: amount || 0,
      salesTax: salesTax || 0,
    });
  }

  /**
   * Converts the fee to its document shape for storage.
   *
   * @returns {Object} Document object ready for storage
   */
  toDocument() {
    return {
      order_id: this.order_id,
      id: this.id,
      date: this.date,
      amount: this.amount,
      salesTax: this.salesTax,
    };
  }
}

export default BrokerFee;

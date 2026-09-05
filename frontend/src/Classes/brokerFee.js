/**
 * The fee charged for listing a job's output on the market.
 *
 * A fee belongs to one market order and is removed with it, which is what
 * `order_id` is for. Whose fee it is comes from that order, which records its
 * own character and corporation, so the fee carries no identity of its own. The
 * same fields are `models.BrokerFee` on the backend, and
 * {@link BrokerFee#toDocument} defines the shape for the SPA.
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
  }

  /**
   * Builds a fee from the wallet journal entry that charged it.
   *
   * The amount is what the fee was worked out to be rather than the entry's own
   * figure: listing several orders at once through multi-sell charges them in a
   * single entry covering all of them. That also makes the entry's id shared
   * between those orders rather than an identity for the fee.
   *
   * The journal is a separate endpoint and can lag the orders, so the entry may
   * be missing entirely. The fee is still known — it was worked out here — and
   * is dated by the listing itself so it files in the month it was charged.
   *
   * @param {Object} [entry] - The journal entry charging it, when found
   * @param {Object} order - The order the fee was charged for
   * @param {number} amount - What the listing cost
   * @returns {BrokerFee}
   */
  static fromJournalEntry(entry, order, amount) {
    return new BrokerFee({
      order_id: order?.order_id ?? null,
      id: entry?.id ?? null,
      date: entry?.date ?? order?.issued ?? null,
      amount: amount || 0,
    });
  }

  /**
   * When the fee was charged, in milliseconds, or `null` without a date.
   *
   * @returns {number|null}
   */
  get chargedAt() {
    const parsed = Date.parse(this.date);
    return Number.isNaN(parsed) ? null : parsed;
  }

  /**
   * Whether the fee was charged for a given market order.
   *
   * @param {number} orderID
   * @returns {boolean}
   */
  belongsToOrder(orderID) {
    return this.order_id !== null && this.order_id === orderID;
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
    };
  }
}

export default BrokerFee;

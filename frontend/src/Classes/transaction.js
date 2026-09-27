/**
 * One sale of a job's output — money that arrived, whether through the market
 * or entered by hand.
 *
 * @class Transaction
 */
class Transaction {
  /**
   * @param {Object} [row] - A transaction row from a job document
   */
  constructor(row) {
    this.transaction_id = row?.transaction_id ?? 0;
    this.order_id = row?.order_id ?? null;
    this.journal_ref_id = row?.journal_ref_id ?? null;
    this.unit_price = row?.unit_price ?? 0;
    this.amount = row?.amount ?? 0;
    this.tax = row?.tax ?? 0;
    this.quantity = row?.quantity ?? 0;
    this.date = row?.date ?? null;
    this.location_id = row?.location_id ?? null;
    this.is_corp = row?.is_corp ?? false;
    this.type_id = row?.type_id ?? null;
    this.description = row?.description ?? null;
    this.CharacterHash = row?.CharacterHash ?? "";
    this.corporation_id = row?.corporation_id ?? null;
    this.character_id = row?.character_id ?? null;
  }

  /**
   * Builds a sale from what ESI returned.
   *
   * @param {Object} esiTransaction - A wallet transaction from ESI
   * @param {Object} [context]
   * @param {Object} [context.journalEntry] - The journal entry it points at
   * @param {Object} [context.taxEntry] - The journal entry charging the tax
   * @param {string} [context.description] - What the sale was, from the journal
   * @param {Object} [context.owner] - The character the wallet was read for
   * @returns {Transaction}
   */
  static fromESI(esiTransaction, context = {}) {
    const { journalEntry, taxEntry, description, owner } = context;
    const transaction = new Transaction(esiTransaction);
    transaction.order_id = null;
    transaction.amount = journalEntry?.amount || 0;
    transaction.tax = Math.abs(taxEntry?.amount) || 0;
    transaction.description = description ?? null;
    transaction.is_corp = !esiTransaction?.is_personal;
    transaction.CharacterHash = owner?.CharacterHash ?? "";
    transaction.character_id =
      esiTransaction?.character_id ?? owner?.CharacterID ?? null;
    transaction.corporation_id = esiTransaction?.corporation_id ?? null;
    return transaction;
  }

  /**
   * Builds a sale someone entered by hand, minted with an id of its own.
   *
   * @param {Object} [fields] - What the person typed
   * @returns {Transaction}
   */
  static custom(fields) {
    return new Transaction({
      ...fields,
      transaction_id: Transaction.mintCustomID(),
    });
  }

  /**
   * Mints an id for a sale entered by hand.
   *
   * @returns {number} A negative safe integer
   */
  static mintCustomID() {
    const parts = new Uint32Array(2);
    crypto.getRandomValues(parts);
    return -((parts[0] % 0x10000) * 0x100000000 + parts[1] + 1);
  }

  /**
   * Whether the money came through the market rather than being entered by
   * hand. `models.IsMarketTransactionID` on the backend is the same rule.
   *
   * @returns {boolean}
   */
  get isFromMarket() {
    return this.transaction_id > 0;
  }

  /**
   * Whether the sale was made from a corporation wallet.
   *
   * @returns {boolean}
   */
  get isCorporationSale() {
    return Boolean(this.is_corp);
  }

  /**
   * When the sale was made, in milliseconds, or `null` without a date.
   *
   * @returns {number|null}
   */
  get soldAt() {
    const parsed = Date.parse(this.date);
    return Number.isNaN(parsed) ? null : parsed;
  }

  /**
   * What the sale brought in before the market took its cut.
   *
   * @returns {number}
   */
  get grossValue() {
    return this.amount || 0;
  }

  /**
   * What the sale brought in once the market had taken its cut.
   *
   * @returns {number}
   */
  get netValue() {
    return this.grossValue - (this.tax || 0);
  }

  /**
   * Whether the planner attributed this sale to a given market order.
   *
   * @param {number} orderID
   * @returns {boolean}
   */
  belongsToOrder(orderID) {
    return this.order_id !== null && this.order_id === orderID;
  }

  /**
   * Converts the transaction to its document shape for storage.
   *
   * @returns {Object} Document object ready for storage
   */
  toDocument() {
    return {
      order_id: this.order_id,
      journal_ref_id: this.journal_ref_id,
      unit_price: this.unit_price,
      amount: this.amount,
      tax: this.tax,
      transaction_id: this.transaction_id,
      quantity: this.quantity,
      date: this.date,
      location_id: this.location_id,
      is_corp: this.is_corp,
      type_id: this.type_id,
      description: this.description,
      CharacterHash: this.CharacterHash,
      corporation_id: this.corporation_id,
      character_id: this.character_id,
    };
  }
}

export default Transaction;

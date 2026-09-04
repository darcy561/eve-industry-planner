/**
 * A market order a job's output is being sold through.
 *
 * A row keeps ESI's own field names, because that is where it came from and
 * where its updates come from: `order_id`, `volume_remain`, `is_corporation`.
 * The same fields are `models.MarketOrder` on the backend, and
 * {@link MarketOrder#toDocument} defines the shape for the SPA.
 *
 * ESI calls the listed price `price`; the row keeps it as `item_price`, because
 * a job's own figures are per item.
 *
 * `character_id` and `corporation_id` say whose order it is. They travel as ids
 * and are held as refs once stored, which `shared/jobidentity` converts at the
 * boundary.
 *
 * @class MarketOrder
 */
class MarketOrder {
  /**
   * @param {Object} [row] - A market order row from a job document
   */
  constructor(row) {
    this.order_id = row?.order_id ?? null;
    this.type_id = row?.type_id ?? null;
    this.item_price = row?.item_price ?? 0;
    this.volume_total = row?.volume_total ?? 0;
    this.volume_remain = row?.volume_remain ?? 0;
    this.duration = row?.duration ?? 0;
    this.issued = row?.issued ?? null;
    this.location_id = row?.location_id ?? null;
    this.region_id = row?.region_id ?? null;
    this.range = row?.range ?? null;
    this.state = row?.state ?? "active";
    this.is_corporation = row?.is_corporation ?? false;
    this.timeStamps = Array.isArray(row?.timeStamps) ? [...row.timeStamps] : [];
    this.CharacterHash = row?.CharacterHash ?? "";
    this.corporation_id = row?.corporation_id ?? null;
    this.character_id = row?.character_id ?? null;
  }

  /**
   * Builds an order from what ESI returned, for the character that placed it.
   *
   * Every field is named rather than passed through, so a rename on either side
   * shows up here instead of quietly changing what is stored. ESI's `price`
   * becomes `item_price`, and the issue date opens the timestamp history that
   * every later update is appended to.
   *
   * @param {Object} esiOrder - A market order from ESI
   * @param {Object} [owner] - The character the order was fetched for
   * @param {string} [owner.CharacterHash]
   * @param {number} [owner.CharacterID]
   * @returns {MarketOrder}
   */
  static fromESI(esiOrder, owner) {
    return new MarketOrder({
      order_id: esiOrder?.order_id ?? null,
      type_id: esiOrder?.type_id ?? null,
      item_price: esiOrder?.price ?? 0,
      volume_total: esiOrder?.volume_total ?? 0,
      volume_remain: esiOrder?.volume_remain ?? 0,
      duration: esiOrder?.duration ?? 0,
      issued: esiOrder?.issued ?? null,
      location_id: esiOrder?.location_id ?? null,
      region_id: esiOrder?.region_id ?? null,
      range: esiOrder?.range ?? null,
      is_corporation: esiOrder?.is_corporation ?? false,
      state: esiOrder?.state ?? "active",
      timeStamps: esiOrder?.issued ? [esiOrder.issued] : [],
      CharacterHash: esiOrder?.CharacterHash ?? owner?.CharacterHash ?? "",
      character_id: esiOrder?.character_id ?? owner?.CharacterID ?? null,
      corporation_id: esiOrder?.corporation_id ?? null,
    });
  }

  /**
   * Whether the order was placed for a corporation rather than the character
   * itself.
   *
   * @returns {boolean}
   */
  get isCorporationOrder() {
    return Boolean(this.is_corporation);
  }

  /**
   * Whether the order is finished: everything listed has sold, or it left the
   * market without selling.
   *
   * Read from the volume and state rather than stored beside them, so an order
   * cannot claim to be finished while it is still listed and holding volume.
   * `models.MarketOrder.IsComplete` on the backend is the same reading.
   *
   * @returns {boolean}
   */
  get isComplete() {
    return (
      this.volume_remain === 0 ||
      this.state === "expired" ||
      this.state === "cancelled"
    );
  }

  /**
   * How many of the listed items have sold.
   *
   * @returns {number}
   */
  get quantitySold() {
    return Math.max(this.volume_total - this.volume_remain, 0);
  }

  /**
   * How many are still listed.
   *
   * @returns {number}
   */
  get quantityRemaining() {
    return Math.max(this.volume_remain, 0);
  }

  /**
   * What the order is worth if everything still listed sells at its price.
   *
   * @returns {number}
   */
  get remainingValue() {
    return this.quantityRemaining * (this.item_price || 0);
  }

  /**
   * When the order was last issued or updated, in milliseconds, or `null`
   * without a date.
   *
   * @returns {number|null}
   */
  get issuedAt() {
    const parsed = Date.parse(this.issued);
    return Number.isNaN(parsed) ? null : parsed;
  }

  /**
   * Takes the latest state of the order from ESI.
   *
   * A finished order is left alone: it will not change again, and re-taking it
   * would append to the timestamp history on every poll. Otherwise the row is
   * only written when something it tracks has actually moved — what is left,
   * when it was issued, its state, or its having just finished — so an
   * unchanged order does not mark the job modified.
   *
   * @param {Object} latest - The same order as ESI last returned it
   * @returns {boolean} Whether anything was taken
   */
  applyLatest(latest) {
    if (!latest || this.isComplete) return false;

    const state = latest.state ? latest.state : "active";
    const finished =
      latest.volume_remain === 0 ||
      state === "expired" ||
      state === "cancelled";
    const changed =
      this.volume_remain !== latest.volume_remain ||
      Date.parse(this.issued) !== Date.parse(latest.issued) ||
      finished ||
      this.state !== state;

    if (!changed) return false;

    this.duration = latest.duration;
    this.item_price = latest.price;
    this.range = latest.range;
    this.volume_remain = latest.volume_remain;
    this.issued = latest.issued;
    this.timeStamps = [...this.timeStamps, latest.issued];
    this.state = state;
    return true;
  }

  /**
   * Converts the order to its document shape for storage.
   *
   * @returns {Object} Document object ready for storage
   */
  toDocument() {
    return {
      duration: this.duration,
      is_corporation: this.is_corporation,
      issued: this.issued,
      location_id: this.location_id,
      order_id: this.order_id,
      item_price: this.item_price,
      range: this.range,
      region_id: this.region_id,
      type_id: this.type_id,
      volume_remain: this.volume_remain,
      volume_total: this.volume_total,
      timeStamps: this.timeStamps,
      CharacterHash: this.CharacterHash,
      state: this.state,
      corporation_id: this.corporation_id,
      character_id: this.character_id,
    };
  }
}

export default MarketOrder;

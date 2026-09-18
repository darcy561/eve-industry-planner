/**
 * An EVE alliance the account can see, built from its corporations.
 *
 * The sibling of `Corporation`, and the difference is what it holds: a corporation tracks the
 * characters the account has linked in it, while an alliance tracks the corporations — that is the
 * membership EVE itself models, and the account reaches an alliance only through a corporation it
 * is in.
 */
class Alliance {
  /**
   * @param {object} corporation - a `Corporation` already built for this account
   * @param {number|string} corporation.corporation_id
   * @param {number|string} corporation.alliance_id
   * @param {object} publicData - public alliance data from EVE ESI
   * @param {string} [publicData.name]
   * @param {string} [publicData.ticker]
   * @param {number} [publicData.executor_corporation_id]
   */
  constructor(corporation, publicData) {
    this.alliance_id = corporation.alliance_id;
    this.allianceName = publicData?.name || "Unknown Alliance";
    this.allianceTicker = publicData?.ticker || "UNKNOWN";
    this.executorCorporationID = publicData?.executor_corporation_id ?? null;
    this.corporations = [corporation.corporation_id];
  }

  /** @param {number|string} corporationID */
  addCorporation(corporationID) {
    if (!corporationID) return;
    if (this.hasCorporation(corporationID)) return;
    this.corporations.push(corporationID);
  }

  /** @param {number|string} corporationID */
  removeCorporation(corporationID) {
    this.corporations = this.corporations.filter(
      (id) => Number(id) !== Number(corporationID),
    );
  }

  /** @param {number|string} corporationID */
  hasCorporation(corporationID) {
    return this.corporations.some((id) => Number(id) === Number(corporationID));
  }
}

export default Alliance;

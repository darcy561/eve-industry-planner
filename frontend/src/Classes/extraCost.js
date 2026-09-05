/**
 * A cost someone added to a job by hand — shipping, a courier contract, a fee
 * the planner has no other way to know about.
 *
 * The same fields are `models.ExtraCost` on the backend, and
 * {@link ExtraCost#toDocument} defines the shape for the SPA.
 *
 * `category` is a string — what the document and the backend hold — and a row
 * can arrive with it missing, empty or numeric. It is settled as the row is
 * built, so nothing downstream has to ask again: no category is `"0"`, which
 * means unassigned.
 * @class ExtraCost
 */
class ExtraCost {
  /**
   * @param {Object} [row] - An extras row from a job document
   */
  constructor(row) {
    this.id = row?.id ?? null;
    this.category = ExtraCost.categoryOf(row?.category);
    this.categoryLabel = row?.categoryLabel ?? "";
    this.extraText = row?.extraText ?? "";
    this.extraValue = row?.extraValue ?? 0;
  }

  /**
   * The category a row belongs to, as the document holds it.
   *
   * @param {*} category
   * @returns {string} The category id, or "0" for unassigned
   */
  static categoryOf(category) {
    if (category == null || category === "") return "0";
    return String(category);
  }

  /**
   * Whether the cost has been filed under a category the user chose.
   *
   * @returns {boolean}
   */
  get isCategorised() {
    return this.category !== "0";
  }

  /**
   * What the cost is called: the text typed against it, or nothing.
   *
   * @returns {string}
   */
  get label() {
    return this.extraText || "";
  }

  /**
   * Converts the cost to its document shape for storage.
   *
   * @returns {Object} Document object ready for storage
   */
  toDocument() {
    return {
      id: this.id,
      category: this.category,
      categoryLabel: this.categoryLabel,
      extraText: this.extraText,
      extraValue: this.extraValue,
    };
  }
}

export default ExtraCost;

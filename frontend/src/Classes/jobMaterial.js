import uuid from "react-uuid";

/**
 * A material a job is built from: what the job needs, what has been bought
 * against it, and what those purchases cost.
 *
 * A row has the same fields in the SPA and in `models.JobMaterial` on the
 * backend, and {@link Material#toDocument} defines that shape for the SPA.
 *
 * How many the job needs is not one of those fields: it comes from the setups,
 * which the job resolves for the material.
 *
 * @class Material
 * @example
 * const material = new Material({ typeID: 34, name: "Tritanium" }, 100);
 */
class Material {
  /**
   * @param {Object} [row] - A material row from a job document, or the recipe
   *   entry a new job is built from
   * @param {number} [row.typeID] - EVE type id of the material
   * @param {string} [row.name] - Material name
   * @param {number} [row.jobType] - Job type that produces it, when one can
   * @param {number} [row.volume] - Volume of one unit
   * @param {Array<Object>} [row.purchasing] - Purchase rows recorded against it
   * @param {number|((typeID: number) => number)} [requirement=0] - How many the
   *   job needs, or a function the job answers it with
   */
  constructor(row, requirement = 0) {
    this.typeID = row?.typeID ?? null;
    this.name = row?.name ?? "";
    this.jobType = row?.jobType ?? 0;
    this.volume = row?.volume ?? 0;
    this.purchasing = Array.isArray(row?.purchasing) ? [...row.purchasing] : [];
    this.#requirement = requirement;
  }

  #requirement;

  /**
   * How many of this material the job needs.
   *
   * The figure belongs to the setups — {@link Job#materialRequirement} sums each
   * setup's `materialCount` — so resizing, adding or removing a setup moves it
   * at once and there is nothing on the row to fall behind.
   *
   * @returns {number}
   */
  get quantity() {
    return typeof this.#requirement === "function"
      ? this.#requirement(this.typeID) || 0
      : this.#requirement || 0;
  }

  /**
   * How many more the job needs before the material is covered.
   *
   * @returns {number}
   */
  get quantityRemaining() {
    return Math.max(0, this.quantity - this.quantityPurchased);
  }


  /**
   * Records a purchase against the material, taking what the job still needs.
   *
   * `taken` is what counts toward the requirement; `leftOver` is what did not
   * fit, for the caller to offer elsewhere. With `recordExcess` the whole
   * purchase is kept on the row and the excess is reported through
   * {@link Material#excessQuantity} rather than charged to the job.
   *
   * @param {Object} purchase - What was bought
   * @param {number} purchase.itemCount - How many were bought
   * @param {number} purchase.itemCost - What each one cost
   * @param {string|null} [purchase.childID] - The child job the units came from, when they were built rather than bought
   * @param {Object} [options]
   * @param {number} [options.availableToBuy] - Cap on what counts, defaulting to what the job still needs
   * @param {boolean} [options.recordExcess=false] - Keep what did not fit on the row
   * @returns {{ taken: number, leftOver: number }}
   */
  importPurchase(
    purchase,
    {
      availableToBuy = this.quantityRemaining,
      recordExcess = false,
    } = {}
  ) {
    const offered = Number(purchase?.itemCount) || 0;
    if (offered <= 0) return { taken: 0, leftOver: 0 };
    if (!isValidPurchase({ ...purchase, itemCount: offered })) {
      return { taken: 0, leftOver: offered };
    }

    const taken = Math.max(0, Math.min(offered, availableToBuy));
    const leftOver = offered - taken;
    const recorded = recordExcess ? offered : taken;

    if (recorded > 0) {
      const childID = purchase.childID ?? null;
      this.purchasing = [
        ...this.purchasing.filter(isValidPurchase),
        {
          id: purchase.id ?? uuid(),
          typeID: this.typeID,
          childID,
          childJobImport: Boolean(childID),
          itemCount: recorded,
          itemCost: purchase.itemCost,
        },
      ];
    }

    return { taken, leftOver };
  }

  /**
   * Removes a purchase from the material.
   *
   * @param {string} purchaseID
   * @returns {boolean} Whether a purchase was removed
   */
  removePurchase(purchaseID) {
    const remaining = this.purchasing.filter((row) => row.id !== purchaseID);
    if (remaining.length === this.purchasing.length) return false;

    this.purchasing = remaining.filter(isValidPurchase);
    return true;
  }

  /**
   * Whether a child job's output has already been imported against the material.
   *
   * @param {string} childJobID
   * @returns {boolean}
   */
  hasPurchaseFromChild(childJobID) {
    return this.purchasing.some((row) => row.childID === childJobID);
  }

  /**
   * How many have been bought, whether or not the job needed them.
   *
   * @returns {number}
   */
  get quantityImported() {
    return this.purchasing.reduce(
      (total, row) => (isValidPurchase(row) ? total + row.itemCount : total),
      0
    );
  }

  /**
   * How many were bought beyond what the job needs. The job is not charged for
   * these.
   *
   * @returns {number}
   */
  get excessQuantity() {
    return Math.max(0, this.quantityImported - this.quantityPurchased);
  }

  /**
   * What was spent buying the material rather than building it: every purchase
   * except the ones imported from a child job, in full.
   *
   * @returns {number}
   */
  get boughtCost() {
    return this.purchasing.reduce(
      (total, row) =>
        isValidPurchase(row) && !row.childJobImport
          ? total + row.itemCount * row.itemCost
          : total,
      0
    );
  }

  /**
   * Whether enough has been bought to cover what the job needs.
   *
   * Answered from the row each time it is asked, so it follows the requirement,
   * which the setups move whenever one changes. A material the setups ask for
   * none of has nothing bought against it rather than everything.
   *
   * @returns {boolean}
   */
  get purchaseComplete() {
    return this.quantity > 0 && this.quantityPurchased >= this.quantity;
  }

  /**
   * What the job is charged for, and how much of it that bought.
   *
   * The cheapest purchases fill the requirement first, so a job pays the best
   * prices it managed and the dearest units are the ones left over. Nothing
   * beyond the requirement adds cost.
   *
   * @returns {{ quantity: number, cost: number }}
   */
  #countedPurchases() {
    const counted = new Map();
    let quantity = 0;
    let cost = 0;
    for (const row of [...this.purchasing]
      .filter(isValidPurchase)
      .sort((a, b) => a.itemCost - b.itemCost)) {
      const take = Math.min(row.itemCount, Math.max(0, this.quantity - quantity));
      counted.set(row.id, Math.max(0, take));
      if (take <= 0) continue;
      quantity += take;
      cost += take * row.itemCost;
    }
    return { quantity, cost, counted };
  }

  /**
   * How many of a purchase's units the job is charged for.
   *
   * A purchase can count in full, in part, or not at all: the cheapest fill the
   * requirement first, and whatever is left over is the excess.
   *
   * @param {string} purchaseID
   * @returns {number}
   */
  countedFromPurchase(purchaseID) {
    return this.#countedPurchases().counted.get(purchaseID) || 0;
  }

  /**
   * How many of the purchases count toward what the job needs.
   *
   * @returns {number}
   */
  get quantityPurchased() {
    return this.#countedPurchases().quantity;
  }

  /**
   * What that counted quantity cost.
   *
   * @returns {number}
   */
  get purchasedCost() {
    return this.#countedPurchases().cost;
  }

  /**
   * Converts the material to its document shape for storage.
   *
   * @returns {Object} Document object ready for storage
   */
  toDocument() {
    return {
      typeID: this.typeID,
      name: this.name,
      jobType: this.jobType,
      volume: this.volume,
      purchasing: this.purchasing,
    };
  }
}

function isValidPurchase(row) {
  return (
    Number.isFinite(row?.itemCount) &&
    row.itemCount >= 0 &&
    Number.isFinite(row?.itemCost) &&
    row.itemCost >= 0
  );
}

export default Material;

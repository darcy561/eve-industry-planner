/**
 * A material a job is built from: what has been bought against it, and what those
 * purchases cost.
 *
 * @class Material
 */

import {
  boughtCost,
  countedPurchases,
  excessQuantity,
  isValidPurchase,
  purchaseComplete,
  quantityImported,
  quantityRemaining,
} from "../Components/Edit Job/Edit Job Hooks/materialSelectors";

class Material {
  /**
   * @param {Object} [row] - A material row from a job document, or the recipe entry a new job is built from
   * @param {number} [row.typeID] - EVE type id of the material
   * @param {string} [row.name] - Material name
   * @param {number} [row.jobType] - Job type that produces it, when one can
   * @param {number} [row.volume] - Volume of one unit
   * @param {Object<string, Object>} [row.purchasing] - Purchase rows recorded
   *   against it, keyed by each purchase's own id
   * @param {number|((typeID: number) => number)} [requirement=0] - How many the
   *   job needs, or a function the job answers it with
   */
  constructor(row, requirement = 0) {
    this.typeID = row?.typeID ?? null;
    this.name = row?.name ?? "";
    this.jobType = row?.jobType ?? 0;
    this.volume = row?.volume ?? 0;
    this.purchasing = keyPurchasesByID(row?.purchasing);
    this.#requirement = requirement;
  }

  #requirement;

  /**
   * How many of this material the job needs, summed over its setups rather than
   * held on the row.
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
    return quantityRemaining(this, this.quantity);
  }

  /**
   * Records a purchase against the material, answering what counted toward the
   * requirement and what did not fit.
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
    { availableToBuy = this.quantityRemaining, recordExcess = false } = {},
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
      const id = purchase.id ?? crypto.randomUUID();
      this.purchasing = keyPurchasesByID(this.purchasing);
      this.purchasing[id] = {
        id,
        childID,
        childJobImport: Boolean(childID),
        itemCount: recorded,
        itemCost: purchase.itemCost,
      };
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
    if (!(purchaseID in this.purchasing)) return false;

    delete this.purchasing[purchaseID];
    this.purchasing = keyPurchasesByID(this.purchasing);
    return true;
  }

  /**
   * Whether a child job's output has already been imported against the material.
   *
   * @param {string} childJobID
   * @returns {boolean}
   */
  hasPurchaseFromChild(childJobID) {
    return Object.values(this.purchasing).some(
      (row) => row.childID === childJobID,
    );
  }

  /**
   * How many have been bought, whether or not the job needed them.
   *
   * @returns {number}
   */
  get quantityImported() {
    return quantityImported(this);
  }

  /**
   * How many were bought beyond what the job needs. The job is not charged for
   * these.
   *
   * @returns {number}
   */
  get excessQuantity() {
    return excessQuantity(this, this.quantity);
  }

  /**
   * What was spent buying the material rather than building it: every purchase
   * except the ones imported from a child job, in full.
   *
   * @returns {number}
   */
  get boughtCost() {
    return boughtCost(this);
  }

  /**
   * Whether enough has been bought to cover what the job needs, with a material
   * the setups ask for none of covered by nothing rather than by everything.
   *
   * @returns {boolean}
   */
  get purchaseComplete() {
    return purchaseComplete(this, this.quantity);
  }

  /**
   * What the job is charged for and what it cost, filling the requirement from
   * the cheapest purchases first.
   *
   * @returns {{ quantity: number, cost: number }}
   */
  #countedPurchases() {
    return countedPurchases(this, this.quantity);
  }

  /**
   * How many of a purchase's units the job is charged for — all of them, some, or
   * none, the cheapest purchases counting first.
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

/**
 * Keys purchase rows by the id each carries, dropping a row without one — every
 * purchase is minted an id as it is recorded.
 *
 * @param {Object<string, Object>|Array<Object>|null} rows
 * @returns {Object<string, Object>} The rows keyed by id
 */
function keyPurchasesByID(rows) {
  const out = {};
  for (const row of Array.isArray(rows) ? rows : Object.values(rows ?? {})) {
    if (!isValidPurchase(row) || row.id === undefined || row.id === null) {
      continue;
    }
    out[String(row.id)] = row;
  }
  return out;
}

export default Material;

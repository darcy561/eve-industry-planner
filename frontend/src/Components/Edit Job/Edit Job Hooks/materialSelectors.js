/**
 * Figures read off one of a job's material rows, as functions of the row rather
 * than getters on an instance.
 *
 * The counted purchases underneath them are the whole of the rule: a job is
 * charged for what it needed, cheapest first, and whatever a purchase bought
 * beyond that is excess the job does not pay for.
 *
 * How many the job needs is not on the row — it belongs to the setups, so
 * resizing one moves it at once and nothing on the row can fall behind. Every
 * figure here takes it as an argument for that reason;
 * `materialRequirement` in the job's own selectors is where it comes from.
 */

/**
 * A purchase the job can be charged for: a count and a price it could have paid.
 *
 * @param {object} row
 * @returns {boolean}
 */
export function isValidPurchase(row) {
  return (
    Number.isFinite(row?.itemCount) &&
    row.itemCount >= 0 &&
    Number.isFinite(row?.itemCost) &&
    row.itemCost >= 0
  );
}

/**
 * How much of each purchase the job is charged for, and what that comes to.
 *
 * Cheapest first, and by id where two cost the same: the rows come out of a map,
 * so their order is whatever the keys happen to give, and which of two equal
 * rows is counted first decides each one's own share. `models.JobMaterial` sorts
 * the same way on the backend.
 *
 * @param {object} material - A material row as the job stores it
 * @param {number} requirement - How many of it the job's setups call for
 * @returns {{quantity: number, cost: number, counted: Map<string, number>}}
 */
export function countedPurchases(material, requirement = 0) {
  const counted = new Map();
  let quantity = 0;
  let cost = 0;
  const needed = Number(requirement) || 0;

  for (const row of Object.values(material?.purchasing ?? {})
    .filter(isValidPurchase)
    .sort((a, b) =>
      a.itemCost !== b.itemCost
        ? a.itemCost - b.itemCost
        : String(a.id).localeCompare(String(b.id)),
    )) {
    const take = Math.min(row.itemCount, Math.max(0, needed - quantity));
    counted.set(row.id, Math.max(0, take));
    if (take <= 0) continue;
    quantity += take;
    cost += take * row.itemCost;
  }

  return { quantity, cost, counted };
}

/**
 * How many of the material the job has been charged for.
 *
 * @param {object} material
 * @param {number} requirement
 * @returns {number}
 */
export function quantityPurchased(material, requirement) {
  return countedPurchases(material, requirement).quantity;
}

/**
 * What that counted quantity cost.
 *
 * @param {object} material
 * @param {number} requirement
 * @returns {number}
 */
export function purchasedCost(material, requirement) {
  return countedPurchases(material, requirement).cost;
}

/**
 * What was spent buying the material rather than building it: every purchase
 * except the ones imported from a child job, in full.
 *
 * Nothing is capped at the requirement — this is what left the wallet, not what
 * the job is charged for.
 *
 * @param {object} material
 * @returns {number}
 */
export function boughtCost(material) {
  return Object.values(material?.purchasing ?? {}).reduce(
    (total, row) =>
      isValidPurchase(row) && !row.childJobImport
        ? total + row.itemCount * row.itemCost
        : total,
    0,
  );
}

/**
 * Whether enough has been bought to cover what the job needs.
 *
 * A material the setups ask for none of has nothing bought against it rather
 * than everything, so a row left behind by a resized setup does not read as
 * done.
 *
 * @param {object} material
 * @param {number} requirement
 * @returns {boolean}
 */
export function purchaseComplete(material, requirement) {
  return requirement > 0 && quantityRemaining(material, requirement) === 0;
}

/**
 * How many of the material the job still needs.
 *
 * @param {object} material
 * @param {number} requirement
 * @returns {number}
 */
export function quantityRemaining(material, requirement) {
  return Math.max(
    0,
    (Number(requirement) || 0) - quantityPurchased(material, requirement),
  );
}

/**
 * How many were bought at all, counted or not.
 *
 * @param {object} material
 * @returns {number}
 */
export function quantityImported(material) {
  return Object.values(material?.purchasing ?? {}).reduce(
    (total, row) => (isValidPurchase(row) ? total + row.itemCount : total),
    0,
  );
}

/**
 * How many were bought beyond what the job needs. The job is not charged for
 * these.
 *
 * @param {object} material
 * @param {number} requirement
 * @returns {number}
 */
export function excessQuantity(material, requirement) {
  return Math.max(
    0,
    quantityImported(material) - quantityPurchased(material, requirement),
  );
}

/**
 * How many of a purchase's units the job is charged for.
 *
 * @param {object} material
 * @param {number} requirement
 * @param {string} purchaseID
 * @returns {number}
 */
export function countedFromPurchase(material, requirement, purchaseID) {
  return countedPurchases(material, requirement).counted.get(purchaseID) || 0;
}

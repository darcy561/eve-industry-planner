import { materialPurchaseState } from "./materialPricing";

/**
 * One row of Materials & Sourcing: what a material costs to buy, what it costs
 * to build, and which of those the plan is on.
 *
 * The comparison is the row's reason to exist, so the delta and the plan are
 * computed here rather than left to the reader to diff by eye.
 */

/**
 * What a row's plan column says.
 *
 * @enum {string}
 */
export const MATERIAL_PLAN = {
  /** Bought already, at a price Price Entry holds. */
  PAID: "paid",
  /** Built from linked child jobs. */
  BUILD: "build",
  /** Bought at market, with a build cost to compare against. */
  BUY: "buy",
  /** Nothing to compare: the material has no blueprint, so it is bought. */
  BASE: "base",
};

/**
 * @typedef {object} MaterialSourcingRow
 * @property {number} typeID
 * @property {string} name
 * @property {number} quantity - How many the job needs
 * @property {number|null} buyPrice - Unit price at the row's hub and basis
 * @property {number|null} buildPrice - Unit cost of building it, null when it cannot be built
 * @property {number|null} delta - Build against buy, as a fraction; negative is cheaper to build
 * @property {string} plan - One of MATERIAL_PLAN
 * @property {boolean} isBuildable - Whether the material has a blueprint at all
 * @property {boolean} isLinked - Whether child jobs are linked for it
 * @property {boolean} isSpeculative - Whether the build price came from a job
 *   built to price the row rather than one the plan commits to
 * @property {number} volume - Total volume the quantity occupies
 * @property {number} paidCost - What was actually paid for it, where it was bought
 * @property {number} remainingQuantity - How many are still to buy or build
 * @property {import("../Groups/childJobCoverage").ChildJobCoverage|null} coverage -
 *   What the linked jobs actually produce against what the row needs, and how
 *   the difference was costed. Null where nothing builds the row.
 * @property {object} mark - What kind of material it is and whether anything builds it
 * @property {object} material - The material itself, for a drawer opened on this row
 * @property {Array<object>} matchedChildJobs - The child jobs behind it
 * @property {string} marketSelect - The hub this row resolved to
 * @property {string} listingSelect - The basis this row resolved to
 */

/**
 * Builds the row for one material.
 *
 * @param {object} params
 * @param {object} params.material - A JobMaterial instance; its totals are getters
 * @param {number} params.buyPrice - Unit price at the resolved hub and basis
 * @param {number|null} params.buildPrice - Unit cost from linked child jobs, or null
 * @param {boolean} params.isBuildable - Whether the material has a blueprint at all
 * @param {boolean} params.isLinked - Whether child jobs are linked for it
 * @param {boolean} [params.isSpeculative] - Whether the build price is a guess
 * @param {Array<object>} [params.matchedChildJobs] - The child jobs behind it
 * @param {string} [params.marketSelect] - The hub the row resolved to
 * @param {string} [params.listingSelect] - The basis the row resolved to
 * @param {number} [params.quantity] - Overrides the material's own requirement,
 *   for a row stating one setup's need rather than the whole job's
 * @param {import("../Groups/childJobCoverage").ChildJobCoverage} [params.coverage]
 * @returns {MaterialSourcingRow}
 */
export function buildMaterialSourcingRow({
  material,
  buyPrice,
  buildPrice,
  isBuildable,
  isLinked,
  isSpeculative = false,
  matchedChildJobs = [],
  mark = null,
  marketSelect,
  listingSelect,
  quantity: quantityOverride,
  coverage = null,
}) {
  const quantity = quantityOverride ?? material?.quantity ?? 0;
  const purchase = materialPurchaseState(material);

  const buy = Number.isFinite(buyPrice) ? buyPrice : null;
  const build =
    isBuildable && Number.isFinite(buildPrice) && buildPrice > 0
      ? buildPrice
      : null;

  return {
    typeID: material?.typeID ?? null,
    name: material?.name ?? "",
    quantity,
    buyPrice: buy,
    buildPrice: build,
    delta: priceDelta(buy, build),
    plan: planFor({ purchase, isBuildable, isLinked, build }),
    isBuildable,
    isLinked,
    isSpeculative,
    volume: (material?.volume ?? 0) * quantity,
    paidCost: purchase.paidCost,
    remainingQuantity: Math.max(0, quantity - purchase.paidQuantity),
    coverage,
    material,
    matchedChildJobs,
    mark,
    marketSelect,
    listingSelect,
  };
}

/**
 * Building against buying, as a fraction of the buy price. Negative is cheaper
 * to build.
 *
 * @param {number|null} buyPrice
 * @param {number|null} buildPrice
 * @returns {number|null} null when there is nothing to compare
 */
export function priceDelta(buyPrice, buildPrice) {
  if (buyPrice === null || buildPrice === null || buyPrice === 0) return null;
  return (buildPrice - buyPrice) / buyPrice;
}

/**
 * @param {object} params
 * @returns {string} One of MATERIAL_PLAN
 */
function planFor({ purchase, isBuildable, isLinked, build }) {
  // Already bought outranks everything: there is a real price on the row, and
  // quoting an estimate beside it would invite a decision that has been made.
  if (purchase.kind === "paid") return MATERIAL_PLAN.PAID;
  if (!isBuildable) return MATERIAL_PLAN.BASE;
  if (isLinked && build !== null) return MATERIAL_PLAN.BUILD;
  return MATERIAL_PLAN.BUY;
}

/**
 * Whether a row is leaving money on the table: building it would cost less, and
 * the plan is still to buy it.
 *
 * The panel marks these rows and offers to switch them, and the summary totals
 * what that would save. Both read this so the mark and the figure cannot
 * disagree about which rows they mean.
 *
 * @param {MaterialSourcingRow} row
 * @returns {boolean}
 */
export function hasSavingAvailable(row) {
  if (!row || row.delta === null || row.delta >= 0) return false;
  return row.plan === MATERIAL_PLAN.BUY;
}

/**
 * @typedef {object} SourcingSummary
 * @property {number} materials - How many rows there are
 * @property {number} buildable - How many have a blueprint, costed or not
 * @property {number} costed - How many of those have a build price worked out
 * @property {number} linked - How many have child jobs linked
 * @property {number} volume - Total volume of everything on the list
 * @property {number} savingAvailable - What switching every cheaper-to-build row would save
 * @property {number} cheaperToBuild - How many rows are cheaper to build than to buy
 */

/**
 * The figures the panel states above and below its table.
 *
 * The saving counts only rows that are cheaper to build **and** not already
 * building, since offering to apply a change that is already applied reads as a
 * figure the panel cannot back up.
 *
 * `buildable` and `costed` are separate because a row has a blueprint long
 * before anything works out what building it would cost. Counting buildable
 * rows by whether they carry a price conflates the two, and the panel then
 * states a total smaller than the number of rows it is talking about.
 *
 * @param {MaterialSourcingRow[]} rows
 * @returns {SourcingSummary}
 */
export function summariseSourcing(rows) {
  const list = Array.isArray(rows) ? rows : [];

  let savingAvailable = 0;
  let cheaperToBuild = 0;

  for (const row of list) {
    if (!hasSavingAvailable(row)) continue;
    cheaperToBuild += 1;
    // Only what is still to source can move to a build plan. Counting the whole
    // requirement offers a saving on units already bought, which applying the
    // change cannot deliver.
    savingAvailable +=
      (row.buyPrice - row.buildPrice) * (row.remainingQuantity ?? row.quantity);
  }

  return {
    materials: list.length,
    buildable: list.filter((row) => row.isBuildable).length,
    costed: list.filter((row) => row.isBuildable && row.buildPrice !== null)
      .length,
    linked: list.filter((row) => row.isLinked).length,
    volume: list.reduce((total, row) => total + row.volume, 0),
    savingAvailable,
    cheaperToBuild,
  };
}

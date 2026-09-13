import { MATERIAL_PLAN } from "./materialSourcingRow";

/**
 * What a build costs, split by what a player is actually paying for.
 *
 * One set of figures, on whichever pricing model is in effect, each part saying
 * what it is made of.
 */

/**
 * @typedef {object} CostLine
 * @property {string} id
 * @property {string} label
 * @property {string} [detail] - What the figure is made of, in words
 * @property {number} value
 * @property {number|null} perUnit - Its share of one unit produced
 * @property {boolean} [alwaysShow] - Kept in the band at zero, where the row
 *   itself is worth stating
 */

/**
 * @typedef {object} CostBand
 * @property {CostLine[]} lines
 * @property {number} total
 * @property {number|null} perUnit
 */

/**
 * @typedef {object} CostBreakdown
 * @property {CostBand} toBuild - What it costs to make the thing
 * @property {CostBand} toSell - What it costs to sell it, paid only on listing
 * @property {number} total
 * @property {number} perUnit
 */

/**
 * A material's cost counts once, in the band that reflects how it is sourced.
 *
 * A linked material contributes its child build cost and nothing to the market
 * line: the child's own unit cost replaces the market price rather than adding
 * to it. A material already bought counts what was paid, because that is not an
 * estimate any more.
 *
 * @param {object} params
 * @param {Array<object>} params.rows - Rows from buildMaterialSourcingRow, each
 *   carrying what its child jobs actually cover
 * @param {number} params.installCost - This job's own slots
 * @param {number} params.inventionCost - What the attempts cost, not per unit
 * @param {Array<object>} params.extras - The extras rows, one line per category
 * @param {number} params.brokerFee - ISK, from brokerFeeAmount
 * @param {number} params.salesTax - ISK, from salesTaxAmount
 * @param {number} params.quantityProduced
 * @param {{brokerFee?: string, salesTax?: string}} [params.sellDetail] - The rates
 *   behind the two selling figures, in words
 * @param {boolean} [params.buyEverything] - Price every material at market, as
 *   though nothing were being built for it
 * @returns {CostBreakdown}
 */
export function buildCostBreakdown({
  rows = [],
  installCost = 0,
  inventionCost = 0,
  extras = [],
  brokerFee = 0,
  salesTax = 0,
  quantityProduced = 0,
  sellDetail = {},
  buyEverything = false,
}) {
  let bought = 0;
  let built = 0;
  let paid = 0;
  let assumedRows = 0;
  let shortfallBought = 0;

  for (const row of rows) {
    // What was already spent is spent whatever the row's plan is, and only what
    // is left counts as still to source. A material bought in part was
    // otherwise losing its paid half and being estimated for units nobody is
    // going to buy.
    paid += row.paidCost ?? 0;

    const remaining = row.remainingQuantity ?? row.quantity;
    if (remaining <= 0) continue;

    // What was already paid stays paid whichever model is being read: it is a
    // record, not an estimate, and no model reprices it.
    if (!buyEverything && row.plan === MATERIAL_PLAN.BUILD) {
      // A row whose child jobs fall short is part built and part bought, and the
      // two halves belong in the bands that describe them. Costing all of it as
      // a build would state a plan the linked jobs do not carry out.
      //
      // What is left to source is covered by the child jobs first: on a row that
      // is partly paid for, the units already bought come off the shortfall
      // before they come off what the jobs make. Scaling both halves by the same
      // fraction instead charged the row for units it had already paid for.
      const coverage = row.coverage;
      if (coverage?.isShort && coverage.buyCost > 0) {
        const buildRate =
          coverage.covered > 0 ? coverage.buildCost / coverage.covered : 0;
        const buyRate =
          coverage.shortfall > 0 ? coverage.buyCost / coverage.shortfall : 0;

        const builtQuantity = Math.min(coverage.covered, remaining);
        const boughtQuantity = Math.max(0, remaining - coverage.covered);

        built += builtQuantity * buildRate;
        bought += boughtQuantity * buyRate;
        shortfallBought += boughtQuantity * buyRate;
        continue;
      }

      if (coverage?.assumed) assumedRows += 1;
      built += (row.buildPrice ?? 0) * remaining;
      continue;
    }
    bought += (row.buyPrice ?? 0) * remaining;
  }

  const counts = countRows(rows, buyEverything);

  const each = (value) =>
    quantityProduced > 0 ? value / quantityProduced : null;

  const toBuild = band(each, [
    {
      id: "bought",
      label: "Materials bought at market",
      detail: materialsDetail(counts, shortfallBought > 0),
      value: bought,
    },
    {
      id: "built",
      label: "Child job builds",
      detail: builtDetail(assumedRows),
      value: built,
    },
    {
      id: "paid",
      label: "Materials already bought",
      detail: `${counts.paid} of ${counts.total} at what you paid`,
      value: paid,
    },
    {
      id: "install",
      label: "Install cost",
      detail: "this job only",
      value: installCost,
    },
    {
      id: "invention",
      label: "Invention",
      detail: "the attempts behind the blueprint",
      value: inventionCost,
    },
    ...extrasLines(extras),
  ]);

  const toSell = band(each, [
    {
      id: "brokerFee",
      label: "Broker fee to list",
      detail: sellDetail.brokerFee,
      value: brokerFee,
    },
    {
      id: "salesTax",
      label: "Sales tax",
      detail: sellDetail.salesTax,
      value: salesTax,
    },
  ]);

  const total = toBuild.total + toSell.total;

  return {
    toBuild,
    toSell,
    total,
    // A job producing nothing has no per-unit cost rather than an infinite one.
    perUnit: each(total),
  };
}

/**
 * The extras, one line each, in the order they were recorded.
 *
 * A line apiece rather than one total, or one per category: a player writes down
 * a courier contract and a set of copies because they are separate costs, and
 * anything that adds them back together is undoing the record they kept. Its
 * category is said beside it rather than instead of it.
 *
 * @param {Array<{id: *, category: string, categoryLabel: string, extraText: string, extraValue: number}>} rows
 * @returns {Array<object>}
 */
function extrasLines(rows) {
  const list = Array.isArray(rows) ? rows : [];

  if (list.length === 0) {
    // Kept at zero where every other line is dropped: a build with no extras
    // recorded is the common case, and the row is how a reader finds out the
    // stage takes them at all.
    return [
      {
        id: "extras",
        label: "Extras",
        detail: "Hauling, courier collateral, copies…",
        value: 0,
        alwaysShow: true,
      },
    ];
  }

  return list.map((row, index) => ({
    // Namespaced so a row's own id cannot collide with a component's, and
    // positioned so two rows saved without ids still draw as two lines.
    id: `extras:${row?.id ?? index}`,
    label: row?.extraText?.trim() || row?.categoryLabel || "Extra cost",
    detail: row?.extraText?.trim()
      ? row?.categoryLabel || undefined
      : undefined,
    value: row?.extraValue ?? 0,
  }));
}

/**
 * @param {Array<object>} rows
 * @param {boolean} [buyEverything]
 * @returns {{total: number, bought: number, built: number, paid: number}}
 */
function countRows(rows, buyEverything = false) {
  const counts = {
    total: rows.length,
    bought: 0,
    built: 0,
    paid: 0,
    unpriced: 0,
  };
  for (const row of rows) {
    if (row.plan === MATERIAL_PLAN.PAID) counts.paid += 1;
    else if (!buyEverything && row.plan === MATERIAL_PLAN.BUILD)
      counts.built += 1;
    else {
      counts.bought += 1;
      // A market holding no orders for the row reports no price, and it is
      // counted for nothing above. Saying so is the difference between a total
      // that is low and a total that is wrong without admitting it.
      if (row.buyPrice === null || row.buyPrice === undefined)
        counts.unpriced += 1;
    }
  }
  return counts;
}

/**
 * Says how much of the list this line covers, since the figure alone does not.
 *
 * @param {{total: number, bought: number, built: number}} counts
 * @param {boolean} [includesShortfall] - Whether a child job's shortfall is in here
 * @returns {string}
 */
function materialsDetail(
  { total, bought, built, unpriced = 0 },
  includesShortfall = false,
) {
  const of = `${bought} of ${total}`;
  const base = built > 0 ? `${of} · ${built} replaced by child builds` : of;
  const withShortfall = includesShortfall
    ? `${base} · includes what child jobs fall short of`
    : base;

  // Last, because it is the part that makes the figure beside it incomplete.
  return unpriced > 0
    ? `${withShortfall} · ${unpriced} not on the market, counted as nothing`
    : withShortfall;
}

/**
 * Says when part of the build line is a resize that has not happened.
 *
 * A child job keeps the size it was created at until the parent is closed, so a
 * figure covering more than it currently produces is an estimate of the resized
 * job rather than a cost the plan can be held to.
 *
 * @param {number} assumedRows
 * @returns {string}
 */
function builtDetail(assumedRows) {
  const base = "their materials and install, not counted above";
  if (assumedRows === 0) return base;

  return `${base} · ${assumedRows} assume${assumedRows === 1 ? "s" : ""} a resize on close`;
}

/**
 * Drops the lines that are nothing, so a breakdown states what it is made of
 * rather than listing every part a build could have had.
 *
 * @param {(value: number) => number|null} each
 * @param {Array<{id: string, label: string, value: number}>} lines
 * @returns {CostBand}
 */
function band(each, lines) {
  const present = lines
    .filter((line) => line.value > 0 || line.alwaysShow)
    .map((line) => ({ ...line, perUnit: each(line.value) }));
  const total = present.reduce((sum, line) => sum + line.value, 0);

  return { lines: present, total, perUnit: each(total) };
}

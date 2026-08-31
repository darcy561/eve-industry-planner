/**
 * Reduces the two statistics reads the panel makes into the figures it renders,
 * so the component holds layout and these hold arithmetic.
 */

/**
 * How a current estimate compares against what the item last cost to build.
 *
 * Returns null when there is nothing to compare against — no estimate, or no
 * build behind it — so the panel can say so rather than render a percentage
 * against zero.
 *
 * @param {number|null|undefined} estimatePerItem - `job.buildCostPerItem()`
 * @param {{lastCostPerItem?: number}|undefined} history
 */
export function estimateComparison(estimatePerItem, history) {
  const estimate = Number(estimatePerItem ?? 0);
  const last = Number(history?.lastCostPerItem ?? 0);
  if (!Number.isFinite(estimate) || estimate <= 0 || last <= 0) return null;

  const difference = estimate - last;
  return {
    estimate,
    last,
    difference,
    percent: (difference / last) * 100,
    dearer: difference > 0,
  };
}

/**
 * The spread the marks describe, or null when fewer than two builds make a range
 * a meaningful thing to show.
 *
 * @param {{buildCount?: number, cheapestCostPerItem?: number, dearestCostPerItem?: number}|undefined} history
 */
export function costRange(history) {
  const builds = Number(history?.buildCount ?? 0);
  if (builds < 2) return null;

  const low = Number(history?.cheapestCostPerItem ?? 0);
  const high = Number(history?.dearestCostPerItem ?? 0);
  if (high <= 0) return null;

  return { low, high, spread: high - low };
}

/**
 * Where an item's output went, as the destination counts the panel lists.
 *
 * Quantities rather than costs: the question is what happened to the items, and
 * a cost total answers a different one.
 *
 * @param {{breakdown?: Object}|undefined} totals
 */
export function outputDestinations(totals) {
  const breakdown = totals?.breakdown ?? {};
  const rows = [
    { key: "market", label: "Sold on market", segment: "standaloneRecordedSale" },
    { key: "stock", label: "Kept as stock", segment: "retainedStock" },
    { key: "chain", label: "Used in other builds", segment: "productionChain" },
  ].map((row) => ({
    ...row,
    quantity: Number(breakdown?.[row.segment]?.itemBuildCount ?? 0),
  }));

  const total = rows.reduce((sum, row) => sum + row.quantity, 0);
  if (total <= 0) return { rows: [], total: 0 };

  return {
    rows: rows.map((row) => ({ ...row, share: row.quantity / total })),
    total,
  };
}

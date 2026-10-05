/**
 * Where this build's cost sits against the ones already archived.
 *
 * The stored marks are whole-build cost per unit — materials, install, invention
 * and extras — so the figure compared against them is the cost to build, never a
 * total that has carried the sell band into it.
 */

/**
 * The spread the marks describe, or null when fewer than two builds make a range
 * a meaningful thing to show.
 *
 * @param {{buildCount?: number, cheapestCostPerItem?: number, dearestCostPerItem?: number}|undefined} history
 * @returns {{low: number, high: number, spread: number}|null}
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
 * The mean of the marks' two ends stands in for a lifetime average: the marks are
 * fixed scalars, and averaging them needs no second read.
 *
 * @param {object|undefined} history
 */
export function averageCostPerItem(history) {
  const low = Number(history?.cheapestCostPerItem ?? 0);
  const high = Number(history?.dearestCostPerItem ?? 0);
  return (low + high) / 2;
}

/**
 * This build read against the archived ones.
 *
 * @param {object|undefined} history - `history` from the account totals read
 * @param {number|null|undefined} perUnit - This build's cost to build, per unit
 * @returns {{builds: number, last: {perUnit: number, month: object}|null,
 *   average: number|null, range: {low: number, high: number, spread: number}|null,
 *   delta: {amount: number, share: number|null}|null,
 *   bar: {low: number, high: number, value: number, average: number}|null,
 *   outside: "below"|"above"|null}}
 */
export function compareToHistory(history, perUnit) {
  const builds = Number(history?.buildCount ?? 0);
  // `Number(null)` is 0, so an absent cost has to be rejected before it is read
  // as a build that cost nothing.
  const value = perUnit == null ? NaN : Number(perUnit);
  const known = Number.isFinite(value) && builds > 0;

  const range = costRange(history);
  const lastPerUnit = Number(history?.lastCostPerItem ?? 0);
  const last =
    builds > 0 && lastPerUnit > 0
      ? { perUnit: lastPerUnit, month: history?.lastCostMonth }
      : null;

  const amount = known && last ? value - last.perUnit : null;

  return {
    builds,
    last,
    average: builds > 0 ? averageCostPerItem(history) : null,
    range,
    delta:
      amount === null
        ? null
        : { amount, share: last.perUnit > 0 ? amount / last.perUnit : null },
    // The bar keeps the archive's own ends so its labels stay true. A cost outside
    // them would otherwise draw as a dot pinned to an end saying nothing about how
    // far past it the build is, which `outside` is for.
    bar:
      known && range
        ? {
            low: range.low,
            high: range.high,
            value,
            average: averageCostPerItem(history),
          }
        : null,
    outside:
      known && range
        ? value < range.low
          ? "below"
          : value > range.high
            ? "above"
            : null
        : null,
  };
}

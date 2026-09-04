import { monthKey } from "../../../../../../Components/Archive Statistics/calendarMonth.js";

/**
 * Reduces the two statistics reads the panel makes into the figures it renders,
 * so the component holds layout and these hold arithmetic.
 */

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
    {
      key: "market",
      label: "Sold on market",
      segment: "standaloneRecordedSale",
    },
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

/** Whether a `{year, month}` names a real calendar month. */
function isSetMonth(month) {
  const index = Number(month?.month ?? 0);
  return Number(month?.year ?? 0) > 0 && index >= 1 && index <= 12;
}

/** A `{year, month}` as `Mar 2026`, or null when the month is unset. */
export function monthLabel(month) {
  if (!isSetMonth(month)) return null;
  return new Date(Date.UTC(month.year, month.month - 1, 1)).toLocaleDateString(
    undefined,
    { month: "short", year: "numeric" },
  );
}

/** A stored `YYYY-MM` key as `Mar 26`, so a narrow chart axis fits more of them. */
export function shortMonthLabel(key) {
  const [year, month] = String(key ?? "").split("-");
  if (!isSetMonth({ year: Number(year), month: Number(month) })) return key;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, 1));
  return `${date.toLocaleDateString(undefined, { month: "short" })} ${year.slice(2)}`;
}

/**
 * The `YYYY-MM` range the cost chart reads: the months the item's own costs are
 * filed under, from the marks.
 *
 * Derived from cost months rather than archive dates. A job's costs are pinned to
 * the month production started, which on imported history can be years before the
 * job was archived, so a window around the archive dates misses them entirely.
 *
 * @param {{firstCostMonth?: Object, lastCostMonth?: Object}|undefined} history
 * @returns {{from: string, to: string}|null}
 */
export function historyWindow(history) {
  const first = history?.firstCostMonth;
  const last = history?.lastCostMonth;
  if (!isSetMonth(first) || !isSetMonth(last)) return null;

  const from = monthKey(first);
  const to = monthKey(last);
  return from <= to ? { from, to } : { from: to, to: from };
}

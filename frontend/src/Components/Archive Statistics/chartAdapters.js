import { mapApiStatsToArchiveBreakdown } from "../Dialogues/Blueprint Archive/mapApiStatsToArchiveBreakdown";

/**
 * Turns statistics responses into the rows the chart primitives draw.
 *
 * Kept apart from the primitives because response shapes belong to the API and
 * will move with it; a primitive that knew `months[]` or `paging` would break
 * when they changed.
 */

/** `YYYY-MM` for a month row, matching the key the documents are stored under. */
export function monthKey(row) {
  const year = Number(row?.year ?? 0);
  const month = Number(row?.month ?? 0);
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
}

/**
 * Month rows for the timeline chart.
 *
 * The month in progress is a partial figure, so it is marked rather than drawn
 * as though it were a finished month standing lower than the rest.
 *
 * @param {object|undefined} data - `GET /statistics/account/timeline`
 */
export function toTimelineRows(data) {
  const months = data?.months ?? [];
  return months.map((row) => ({
    month: monthKey(row),
    complete: row?.complete !== false,
    jobCostTotal: Number(row?.jobCostTotal ?? 0),
    salesTotal: Number(row?.salesTotal ?? 0),
    profitLoss: Number(row?.profitLoss ?? 0),
  }));
}

/**
 * Running total of profit across the window.
 *
 * @param {object|undefined} data - `GET /statistics/account/timeline`
 */
export function toCumulativeRows(data) {
  let running = 0;
  return toTimelineRows(data).map((row) => {
    running += row.profitLoss;
    return { ...row, cumulativeProfit: running };
  });
}

/**
 * Item rows for the ranked breakdown.
 *
 * Rows keep the order the server ranked them in; sorting here would rank a page
 * against itself rather than against every item in the window.
 *
 * @param {object|undefined} data - `GET /statistics/account/timeline/items`
 * @param {Record<number, string>} [names] - type id to item name
 */
export function toItemRows(data, names = {}) {
  const items = data?.items ?? [];
  return items.map((row) => ({
    typeID: row?.typeID,
    name: names[row?.typeID] || `Type ${row?.typeID ?? "?"}`,
    jobCostTotal: Number(row?.jobCostTotal ?? 0),
    salesTotal: Number(row?.salesTotal ?? 0),
    profitLoss: Number(row?.profitLoss ?? 0),
  }));
}

/** Segment labels, matching the blocks the archive dialogue shows. */
const SEGMENT_LABELS = {
  standaloneWithRecordedSale: "Market",
  retainedFullStock: "Stock",
  productionChain: "Chain",
};

/**
 * Segment shares for the pie chart.
 *
 * Built through the archive dialogue's own mapper, so the page and the dialogue
 * cannot disagree about what Market or Chain means. Segments with no activity
 * are dropped rather than drawn as empty slices.
 *
 * @param {object|undefined} row - one row from `GET /statistics/account/totals`
 * @param {string} [measure] - which figure the slices compare
 */
export function toSegmentRows(row, measure = "jobCostTotal") {
  const breakdown = mapApiStatsToArchiveBreakdown(row);
  if (!breakdown) return [];

  return Object.entries(SEGMENT_LABELS)
    .map(([key, label]) => ({
      segment: label,
      value: Number(breakdown[key]?.[measure] ?? 0),
    }))
    .filter((slice) => slice.value !== 0);
}

/**
 * Extras spend per month, split by category.
 *
 * The API returns bare category ids. Names come from the account's own category
 * list, which must include deleted ones: a past cost belongs to the category it
 * was filed under, even after the user stops offering it for new entries.
 *
 * @param {object|undefined} data - `GET /statistics/account/timeline`
 * @param {Array<{id: string, label: string}>} [categories]
 * @returns {{rows: object[], series: {key: string, label: string}[]}}
 */
export function toExtrasRows(data, categories = []) {
  const months = data?.months ?? [];
  const labels = new Map(
    categories.map((category) => [String(category.id), category.label]),
  );

  const seen = new Set();
  const rows = months.map((row) => {
    const totals = row?.extraCategoryTotals ?? {};
    const entry = { month: monthKey(row) };
    for (const [id, amount] of Object.entries(totals)) {
      const value = Number(amount ?? 0);
      if (value === 0) continue;
      seen.add(id);
      entry[id] = value;
    }
    return entry;
  });

  const series = [...seen].sort().map((id) => ({
    key: id,
    label: labels.get(id) ?? `Category ${id}`,
    type: "bar",
  }));

  return { rows, series };
}

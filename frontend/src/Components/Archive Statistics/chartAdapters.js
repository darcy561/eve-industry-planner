import { monthKey } from "./calendarMonth.js";

import { mapApiStatsToArchiveBreakdown } from "../Dialogues/Blueprint Archive/mapApiStatsToArchiveBreakdown";

/**
 * Turns statistics responses into the rows the chart primitives draw.
 *
 * Kept apart from the primitives because response shapes belong to the API and
 * will move with it; a primitive that knew `months[]` or `paging` would break
 * when they changed.
 */

/**
 * Month rows for the timeline chart.
 *
 * The month in progress is a partial figure, so it is marked rather than drawn
 * as though it were a finished month standing lower than the rest.
 *
 * @param {object|undefined} data - `GET /statistics/{owner}/timeline`
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
 * @param {object|undefined} data - `GET /statistics/{owner}/timeline`
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
 * @param {object|undefined} data - `GET /statistics/{owner}/timeline/items`
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
 * @param {object|undefined} row - one row from `GET /statistics/{owner}/totals`
 * @param {string} [measure] - which figure the slices compare
 */
/**
 * Item rows as slices of one measure.
 *
 * A slice is a share of a total, which a negative figure cannot be, so items
 * that lost money on the selected measure are left out rather than drawn as
 * though they contributed to it.
 *
 * @param {Object} data
 * @param {Record<number, string>} names
 * @param {string} measure
 */
export function toItemShareRows(data, names = {}, measure = "profitLoss") {
  return toItemRows(data, names)
    .map((row) => ({ name: row.name, value: Number(row[measure] ?? 0) }))
    .filter((slice) => slice.value > 0);
}

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
 * @param {object|undefined} data - `GET /statistics/{owner}/timeline`
 * @param {Array<{id: string, label: string}>} [categories]
 * @returns {{rows: object[], series: {key: string, label: string}[]}}
 */
/**
 * The components a period's cost is made of, in the order they are drawn. The six
 * together are what a job cost, so the charts partition it rather than sampling
 * it; extras appear here as one figure and per category in their own charts.
 */
export const COST_COMPONENTS = [
  { key: "materialCostTotal", label: "Materials" },
  { key: "installCostTotal", label: "Install" },
  { key: "inventionCostTotal", label: "Invention" },
  { key: "extrasTotal", label: "Extras" },
  { key: "brokersFeeTotal", label: "Broker fees" },
  { key: "transactionFeeTotal", label: "Transaction Fees" },
];

/**
 * The components of what it costs to *build*, which is what a current estimate is
 * compared against. Broker and transaction fees are sale-side and are not part of
 * that question.
 *
 * Filtered from COST_COMPONENTS rather than restated, so a label or an order
 * change lands in one place.
 */
const BUILD_COST_KEYS = new Set([
  "materialCostTotal",
  "installCostTotal",
  "inventionCostTotal",
  "extrasTotal",
]);

export const BUILD_COST_COMPONENTS = COST_COMPONENTS.filter(({ key }) =>
  BUILD_COST_KEYS.has(key),
);

/**
 * The build-cost-per-unit chart, wherever an item's cost history is shown. Reads
 * the rows [toBuildCostPerUnitRows] produces.
 */
export const COST_SERIES = [
  ...BUILD_COST_COMPONENTS.map(({ key, label }) => ({ key, label, type: "bar" })),
  {
    key: "averageSalePrice",
    label: "Avg sale price",
    type: "line",
    role: "sales",
    // An item is not sold every month it is built.
    sparse: true,
  },
];

/**
 * Build cost per unit produced, per month, with the average price its output
 * sold for.
 *
 * A month that produced nothing carries null rather than zero: no build happened,
 * which is a different statement from one that cost nothing, and a null leaves a
 * gap in the chart where a zero would draw a floor.
 *
 * @param {Object} data - `GET /statistics/{owner}/timeline`
 */
export function toBuildCostPerUnitRows(data) {
  const months = data?.months ?? [];
  return months.map((row) => {
    const produced = Number(row?.quantityProduced ?? 0);
    const sold = Number(row?.quantitySold ?? 0);

    const entry = {
      month: monthKey(row),
      complete: Boolean(row?.complete),
      quantityProduced: produced,
      averageSalePrice: sold > 0 ? Number(row?.salesTotal ?? 0) / sold : null,
    };
    for (const { key } of BUILD_COST_COMPONENTS) {
      entry[key] = produced > 0 ? Number(row?.[key] ?? 0) / produced : null;
    }
    return entry;
  });
}

/**
 * The figures a set of months adds up to, summed from the same rows the charts
 * draw so the two cannot disagree.
 *
 * @param {Object[]} months
 */
export function sumTimelineMeasures(months = []) {
  return months.reduce(
    (total, row) => ({
      quantityProduced: total.quantityProduced + Number(row?.quantityProduced ?? 0),
      quantitySold: total.quantitySold + Number(row?.quantitySold ?? 0),
      salesTotal: total.salesTotal + Number(row?.salesTotal ?? 0),
      jobCostTotal: total.jobCostTotal + Number(row?.jobCostTotal ?? 0),
      profitLoss: total.profitLoss + Number(row?.profitLoss ?? 0),
    }),
    {
      quantityProduced: 0,
      quantitySold: 0,
      salesTotal: 0,
      jobCostTotal: 0,
      profitLoss: 0,
    },
  );
}

/**
 * What was built and what was sold, per month. Counts, so a month with neither
 * carries zero rather than a gap.
 *
 * @param {Object} data - `GET /statistics/{owner}/timeline`
 */
export function toQuantityRows(data) {
  const months = data?.months ?? [];
  return months.map((row) => ({
    month: monthKey(row),
    complete: Boolean(row?.complete),
    quantityProduced: Number(row?.quantityProduced ?? 0),
    quantitySold: Number(row?.quantitySold ?? 0),
  }));
}

/**
 * Cost components per month, as stacked bars.
 *
 * @param {Object} data
 */
export function toCostComponentRows(data) {
  const months = data?.months ?? [];
  return months.map((row) => {
    const entry = { month: monthKey(row), complete: Boolean(row?.complete) };
    for (const { key } of COST_COMPONENTS) {
      entry[key] = Number(row?.[key] ?? 0);
    }
    return entry;
  });
}

/**
 * Cost components for the whole window, one slice each. Reads the response's own
 * totals, so this cannot disagree with the month-by-month chart.
 *
 * @param {Object} data
 */
export function toCostComponentTotalRows(data) {
  const totals = data?.totals ?? {};
  return COST_COMPONENTS.map(({ key, label }) => ({
    component: label,
    value: Number(totals?.[key] ?? 0),
  }))
    .filter((slice) => slice.value > 0)
    .sort((a, b) => b.value - a.value);
}

/**
 * Extras spend for the whole window, one slice per category. Reads the timeline's
 * own totals, so this cannot disagree with the month-by-month chart.
 *
 * @param {Object} data
 * @param {Array<{id: string, label: string}>} categories
 */
export function toExtrasTotalRows(data, categories = []) {
  const totals = data?.totals?.extraCategoryTotals ?? {};
  const labels = new Map(
    categories.map((category) => [String(category.id), category.label]),
  );

  return Object.entries(totals)
    .map(([id, amount]) => ({
      category: labels.get(id) ?? `Category ${id}`,
      value: Number(amount ?? 0),
    }))
    .filter((slice) => slice.value > 0)
    .sort((a, b) => b.value - a.value);
}

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

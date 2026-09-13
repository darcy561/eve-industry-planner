import { useMemo, useState } from "react";
import { MenuItem } from "@mui/material";
import AppShellSelect from "../../Styled Components/Select/AppShellSelect";
import AppShellPanel from "../../Styled Components/Paper/AppShellPanel";
import {
  ChartKeys,
  PieChart,
  TimeSeriesChart,
} from "../../Styled Components/Charts";
import { useAccountTimelineItemsQuery } from "../../Hooks/React Query/Backend/statisticsTimeline";
import { useAccountTotalsSummaryQuery } from "../../Hooks/React Query/Backend/statisticsTotals";
import {
  toCostComponentTotalRows,
  toCumulativeRows,
  toExtrasRows,
  toExtrasTotalRows,
  toItemShareRows,
  toQuantityRows,
  toSegmentRows,
  toTimelineRows,
} from "./chartAdapters";
import { monthLabel, NoData, useCostComponentStack } from "./panelParts";
// From the module rather than the folder's index, which a panel test replaces
// with stand-ins for the chart components; the state behind the keys is not one.
import { useChartKeys } from "../../Styled Components/Charts/useChartKeys";
import { formatNumberForLocale } from "../../Functions/Helper/numberParser";
import { timelineWindow, useArchiveTimeline } from "./useArchiveTimeline";
import { useItemNames } from "../../Hooks/Static/useItems";

/** The measure a panel ranks or splits by, shown in the panel header. */
function MeasureSelect({ value, onChange, options }) {
  return (
    <AppShellSelect fullWidth value={value} onChange={onChange}>
      {options.map((option) => (
        <MenuItem key={option.key} value={option.key}>
          By {option.label.toLowerCase()}
        </MenuItem>
      ))}
    </AppShellSelect>
  );
}

/**
 * Profit and cost per calendar month.
 *
 * @param {Object} [props]
 * @param {string} [props.from]
 * @param {string} [props.to]
 */
export function ArchiveTimelinePanel({ from, to, range }) {
  const { data, isLoading, isError } = useArchiveTimeline({ from, to, range });
  const rows = useMemo(() => toTimelineRows(data), [data]);

  return (
    <AppShellPanel
      title="Monthly totals"
      componentName="Archive Timeline Panel"
      isLoading={isLoading}
      isError={isError}
    >
      {rows.length === 0 ? (
        <NoData>No archived jobs in this period.</NoData>
      ) : (
        <TimeSeriesChart
          rows={rows}
          categoryKey="month"
          formatCategory={monthLabel(rows)}
          series={[
            { key: "jobCostTotal", label: "Cost", type: "bar", role: "cost" },
            { key: "salesTotal", label: "Sales", type: "bar", role: "sales" },
            {
              key: "profitLoss",
              label: "Profit",
              type: "line",
              role: "profit",
            },
          ]}
        />
      )}
    </AppShellPanel>
  );
}

/** Running profit across the window. */
export function ArchiveCumulativePanel({ from, to, range }) {
  const { data, isLoading, isError } = useArchiveTimeline({ from, to, range });
  const rows = useMemo(() => toCumulativeRows(data), [data]);

  return (
    <AppShellPanel
      title="Cumulative profit"
      componentName="Archive Cumulative Panel"
      isLoading={isLoading}
      isError={isError}
    >
      {rows.length === 0 ? (
        <NoData>No archived jobs in this period.</NoData>
      ) : (
        <TimeSeriesChart
          rows={rows}
          categoryKey="month"
          formatCategory={monthLabel(rows)}
          series={[
            {
              key: "cumulativeProfit",
              label: "Running profit",
              type: "area",
              splitAtZero: true,
            },
          ]}
        />
      )}
    </AppShellPanel>
  );
}

/** The chart and the table below it read the same rows, so they share a name. */
export const ITEM_BREAKDOWN_TITLE = "Top items";

const ITEM_MEASURES = [
  { key: "profitLoss", label: "Profit" },
  { key: "jobCostTotal", label: "Cost" },
  { key: "salesTotal", label: "Sales" },
];

/** How the top items split the selected measure. */
export function ArchiveItemChartPanel({ from, to, range, limit = 10 }) {
  const [sort, setSort] = useState("profitLoss");
  const { data, isLoading, isError } = useAccountTimelineItemsQuery({
    sort,
    limit,
    ...timelineWindow({ from, to, range }),
  });

  const names = useItemNames(data?.items ?? []);

  const rows = useMemo(
    () => toItemShareRows(data, names, sort),
    [data, names, sort],
  );
  const measure = ITEM_MEASURES.find((m) => m.key === sort);
  // An empty period and a period where nothing profited are different answers.
  const allNegative = rows.length === 0 && (data?.items?.length ?? 0) > 0;

  return (
    <AppShellPanel
      title={ITEM_BREAKDOWN_TITLE}
      componentName="Archive Item Chart Panel"
      action={
        <MeasureSelect
          value={sort}
          onChange={setSort}
          options={ITEM_MEASURES}
        />
      }
      isLoading={isLoading}
      isError={isError}
    >
      {rows.length === 0 ? (
        <NoData>
          {allNegative
            ? `No item returned a positive ${measure?.label.toLowerCase()} in this period.`
            : "No archived jobs in this period."}
        </NoData>
      ) : (
        <PieChart rows={rows} categoryKey="name" valueKey="value" />
      )}
    </AppShellPanel>
  );
}

const SEGMENT_MEASURES = [
  { key: "jobCostTotal", label: "Cost" },
  { key: "salesTotal", label: "Sales" },
  { key: "totalJobs", label: "Jobs" },
];

/**
 * How the archive splits across Market, Stock and Chain.
 *
 * Reads lifetime totals rather than the window: the segment a job belongs to is
 * a property of the job, so this describes the archive as a whole.
 */
export function ArchiveSegmentPanel() {
  const [measure, setMeasure] = useState("jobCostTotal");
  const { data, isLoading, isError } = useAccountTotalsSummaryQuery();
  const rows = useMemo(() => toSegmentRows(data, measure), [data, measure]);

  return (
    <AppShellPanel
      title="Where the work went"
      componentName="Archive Segment Panel"
      action={
        <MeasureSelect
          value={measure}
          onChange={setMeasure}
          options={SEGMENT_MEASURES}
        />
      }
      isLoading={isLoading}
      isError={isError}
    >
      {rows.length === 0 ? (
        <NoData>Nothing archived yet.</NoData>
      ) : (
        <PieChart rows={rows} categoryKey="segment" valueKey="value" />
      )}
    </AppShellPanel>
  );
}

/** What a period's cost was spent on, month by month. */
export function ArchiveCostBreakdownPanel({ from, to, range }) {
  const { data, isLoading, isError } = useArchiveTimeline({ from, to, range });
  const { rows, series, toggle, seed } = useCostComponentStack(data);

  return (
    <AppShellPanel
      title="What it cost"
      componentName="Archive Cost Breakdown Panel"
      isLoading={isLoading}
      isError={isError}
    >
      {rows.length === 0 ? (
        <NoData>No archived jobs in this period.</NoData>
      ) : (
        <>
          <ChartKeys series={series} seed={seed} onToggle={toggle} />
          <TimeSeriesChart
            rows={rows}
            categoryKey="month"
            formatCategory={monthLabel(rows)}
            series={series}
            showLegend={false}
            paletteSeed={seed}
          />
        </>
      )}
    </AppShellPanel>
  );
}

// Counts are whole things, so they carry no decimals.
const COUNT = (value) =>
  formatNumberForLocale(Number(value ?? 0), { min: 0, max: 0 });

/**
 * How much of what was built has no sale recorded against it.
 *
 * Derived rather than tracked: nothing can match a stack in a hangar to the job
 * that built it, so this is what the archive knows — produced, less what sold —
 * frozen at the point each job was archived. Output consumed by a parent build
 * is not counted, because the timeline sums direct buckets unless an item view
 * asks for the chain.
 */
export function ArchiveStockPanel({ from, to, range }) {
  const { data, isLoading, isError } = useArchiveTimeline({ from, to, range });
  const rows = useMemo(() => toQuantityRows(data), [data]);
  const kept = rows.some((row) => row.quantityKept > 0);

  return (
    <AppShellPanel
      title="Kept as stock"
      componentName="Archive Stock Panel"
      isLoading={isLoading}
      isError={isError}
    >
      {rows.length === 0 ? (
        <NoData>No archived jobs in this period.</NoData>
      ) : !kept ? (
        <NoData>Everything built in this period sold.</NoData>
      ) : (
        <TimeSeriesChart
          rows={rows}
          categoryKey="month"
          formatCategory={monthLabel(rows)}
          formatValue={COUNT}
          series={[
            { key: "quantityProduced", label: "Produced", type: "bar" },
            { key: "quantitySold", label: "Sold", type: "bar" },
            { key: "quantityKept", label: "Kept", type: "line" },
          ]}
        />
      )}
    </AppShellPanel>
  );
}

/** The same components summed over the period, as shares of the total. */
export function ArchiveCostTotalsPanel({ from, to, range }) {
  const { data, isLoading, isError } = useArchiveTimeline({ from, to, range });
  const rows = useMemo(() => toCostComponentTotalRows(data), [data]);

  return (
    <AppShellPanel
      title="Costs for the period"
      componentName="Archive Cost Totals Panel"
      isLoading={isLoading}
      isError={isError}
    >
      {rows.length === 0 ? (
        <NoData>No costs recorded in this period.</NoData>
      ) : (
        <PieChart rows={rows} categoryKey="component" valueKey="value" />
      )}
    </AppShellPanel>
  );
}

/** Extras spend for the whole period, split by category. */
export function ArchiveExtrasTotalsPanel({ from, to, range }) {
  const { data, isLoading, isError } = useArchiveTimeline({ from, to, range });
  const rows = useMemo(() => toExtrasTotalRows(data), [data]);

  return (
    <AppShellPanel
      title="Extras for the period"
      componentName="Archive Extras Totals Panel"
      isLoading={isLoading}
      isError={isError}
    >
      {rows.length === 0 ? (
        <NoData>No extra costs recorded in this period.</NoData>
      ) : (
        <PieChart rows={rows} categoryKey="category" valueKey="value" />
      )}
    </AppShellPanel>
  );
}

/**
 * Its own colours: the categories here come from the data, and every month chart
 * would otherwise start from the same place in the rotation as the fixed ones.
 */
const EXTRAS_SEED = "archive-extras";

/**
 * Extras spend per month, split by category.
 *
 * Category names come from the account's own list, deleted entries included: a
 * past cost belongs to the category it was filed under.
 *
 * One category can be most of an account's extras — a haulage bill against a few
 * million in copies — so the categories are keys a reader can take off, the same
 * control the cost charts carry.
 */
export function ArchiveExtrasPanel({ from, to, range }) {
  const { data, isLoading, isError } = useArchiveTimeline({ from, to, range });
  const { rows, series: categories } = useMemo(
    () => toExtrasRows(data),
    [data],
  );
  const { series, toggle } = useChartKeys(categories);

  return (
    <AppShellPanel
      title="Extras by category"
      componentName="Archive Extras Panel"
      isLoading={isLoading}
      isError={isError}
    >
      {categories.length === 0 ? (
        <NoData>No extra costs recorded in this period.</NoData>
      ) : (
        <>
          <ChartKeys series={series} seed={EXTRAS_SEED} onToggle={toggle} />
          <TimeSeriesChart
            rows={rows}
            categoryKey="month"
            formatCategory={monthLabel(rows)}
            series={series}
            showLegend={false}
            paletteSeed={EXTRAS_SEED}
          />
        </>
      )}
    </AppShellPanel>
  );
}

import { useMemo, useState } from "react";
import { FormControl, MenuItem, Select, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import {
  appShellOutlinedFormControl,
  getAppShellSelectMenuProps,
} from "../../Context/appShell";
import AppShellPanel from "../../Styled Components/Paper/AppShellPanel";
import { PieChart, TimeSeriesChart } from "../../Styled Components/Charts";
import useUsersStore from "../../Zustand/usersStore";
import {
  useAccountTimelineItemsQuery,
} from "../../Hooks/React Query/Backend/statisticsTimeline";
import { useAccountTotalsSummaryQuery } from "../../Hooks/React Query/Backend/statisticsTotals";
import {
  COST_COMPONENTS,
  toCostComponentRows,
  toCostComponentTotalRows,
  toCumulativeRows,
  toExtrasRows,
  toExtrasTotalRows,
  toItemShareRows,
  toQuantityRows,
  toSegmentRows,
  toTimelineRows,
} from "./chartAdapters";
import { monthLabel, NoData } from "./panelParts";
import { formatNumberForLocale } from "../../Functions/Helper/numberParser";
import { timelineWindow, useArchiveTimeline } from "./useArchiveTimeline";
import { useItemNames } from "../../Hooks/useItemNames";

/** The measure a panel ranks or splits by, shown in the panel header. */
function MeasureSelect({ value, onChange, options }) {
  const theme = useTheme();
  return (
    <FormControl
      fullWidth
      size="small"
      sx={(t) => ({ ...appShellOutlinedFormControl(t) })}
    >
      <Select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        MenuProps={getAppShellSelectMenuProps(theme)}
      >
        {options.map((option) => (
          <MenuItem key={option.key} value={option.key}>
            By {option.label.toLowerCase()}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
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
            { key: "profitLoss", label: "Profit", type: "line", role: "profit" },
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
              role: "profit",
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
  const rows = useMemo(() => toCostComponentRows(data), [data]);
  const series = useMemo(
    () => COST_COMPONENTS.map(({ key, label }) => ({ key, label, type: "bar" })),
    [],
  );

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
        <TimeSeriesChart
          rows={rows}
          categoryKey="month"
          formatCategory={monthLabel(rows)}
          series={series}
        />
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
 * Extras spend per month, split by category.
 *
 * Category names come from the account's own list, deleted entries included: a
 * past cost belongs to the category it was filed under.
 */
export function ArchiveExtrasPanel({ from, to, range }) {
  const { data, isLoading, isError } = useArchiveTimeline({ from, to, range });
  const { rows, series } = useMemo(() => toExtrasRows(data), [data]);

  return (
    <AppShellPanel
      title="Extras by category"
      componentName="Archive Extras Panel"
      isLoading={isLoading}
      isError={isError}
    >
      {series.length === 0 ? (
        <NoData>No extra costs recorded in this period.</NoData>
      ) : (
        <TimeSeriesChart
          rows={rows}
          categoryKey="month"
          formatCategory={monthLabel(rows)}
          series={series}
        />
      )}
    </AppShellPanel>
  );
}

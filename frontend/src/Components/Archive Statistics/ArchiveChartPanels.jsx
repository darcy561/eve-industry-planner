import { useEffect, useMemo, useState } from "react";
import { FormControl, MenuItem, Select, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import {
  appShellOutlinedFormControl,
  getAppShellSelectMenuProps,
} from "../../Context/appShell";
import AppShellPanel from "../../Styled Components/Paper/AppShellPanel";
import { PieChart, TimeSeriesChart } from "../../Styled Components/Charts";
import { getFullItemList } from "../../Functions/Helper/getCachedData";
import useUsersStore from "../../Zustand/usersStore";
import {
  useAccountTimelineQuery,
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
  toSegmentRows,
  toTimelineRows,
} from "./chartAdapters";

/** A month in progress is partial, so it is labelled rather than drawn as final. */
function monthLabel(rows) {
  return (value) => {
    const row = rows.find((r) => r.month === value);
    return row && !row.complete ? `${value} (so far)` : value;
  };
}

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
 * Item names for a page of rows, from the cached static list.
 *
 * @param {{typeID: number}[]} items
 */
function useItemNames(items) {
  const [names, setNames] = useState({});

  useEffect(() => {
    let cancelled = false;
    if (items.length === 0) return undefined;

    getFullItemList()
      .then((list) => {
        if (cancelled || !list) return;
        setNames(
          Object.fromEntries(items.map(({ typeID }) => [typeID, list[typeID]?.name])),
        );
      })
      .catch(() => {
        // A missing name only costs a slice its label.
      });

    return () => {
      cancelled = true;
    };
  }, [items]);

  return names;
}

/** Shared empty state, so a panel with no rows says why rather than drawing nothing. */
function NoData({ children }) {
  return (
    <Typography
      variant="body2"
      color="text.secondary"
      sx={{ py: 4 }}
      align="center"
    >
      {children}
    </Typography>
  );
}

/**
 * Profit and cost per calendar month.
 *
 * @param {Object} [props]
 * @param {string} [props.from]
 * @param {string} [props.to]
 */
export function ArchiveTimelinePanel({ from, to }) {
  const { data, isLoading, isError } = useAccountTimelineQuery(
    from && to ? { from, to } : {},
  );
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
export function ArchiveCumulativePanel({ from, to }) {
  const { data, isLoading, isError } = useAccountTimelineQuery(
    from && to ? { from, to } : {},
  );
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
export function ArchiveItemChartPanel({ from, to, limit = 10 }) {
  const [sort, setSort] = useState("profitLoss");
  const { data, isLoading, isError } = useAccountTimelineItemsQuery({
    sort,
    limit,
    ...(from && to ? { from, to } : {}),
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
export function ArchiveCostBreakdownPanel({ from, to }) {
  const { data, isLoading, isError } = useAccountTimelineQuery(
    from && to ? { from, to } : {},
  );
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

/** The same components summed over the period, as shares of the total. */
export function ArchiveCostTotalsPanel({ from, to }) {
  const { data, isLoading, isError } = useAccountTimelineQuery(
    from && to ? { from, to } : {},
  );
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
export function ArchiveExtrasTotalsPanel({ from, to }) {
  const { data, isLoading, isError } = useAccountTimelineQuery(
    from && to ? { from, to } : {},
  );
  const categories = useUsersStore(
    (state) => state.applicationSettings.extrasCategories,
  );
  const rows = useMemo(
    () => toExtrasTotalRows(data, categories),
    [data, categories],
  );

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
export function ArchiveExtrasPanel({ from, to }) {
  const { data, isLoading, isError } = useAccountTimelineQuery(
    from && to ? { from, to } : {},
  );
  const categories = useUsersStore(
    (state) => state.applicationSettings.extrasCategories,
  );
  const { rows, series } = useMemo(
    () => toExtrasRows(data, categories),
    [data, categories],
  );

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

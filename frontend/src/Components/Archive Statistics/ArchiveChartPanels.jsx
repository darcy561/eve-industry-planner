import { useMemo, useState } from "react";
import { MenuItem, Select, Stack, Typography } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import ContentPanel from "../../Styled Components/Paper/ContentPanel";
import {
  PieChart,
  RankedBarChart,
  TimeSeriesChart,
} from "../../Styled Components/Charts";
import { getFullItemList } from "../../Functions/Helper/getCachedData";
import useUsersStore from "../../Zustand/usersStore";
import {
  useAccountTimelineQuery,
  useAccountTimelineItemsQuery,
} from "../../Hooks/React Query/Backend/statisticsTimeline";
import { useAccountTotalsQuery } from "../../Hooks/React Query/Backend/statisticsTotals";
import {
  toCumulativeRows,
  toExtrasRows,
  toItemRows,
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
    <ContentPanel
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
            { key: "jobCostTotal", label: "Cost", type: "bar" },
            { key: "salesTotal", label: "Sales", type: "bar" },
            { key: "profitLoss", label: "Profit", type: "line" },
          ]}
        />
      )}
    </ContentPanel>
  );
}

/** Running profit across the window. */
export function ArchiveCumulativePanel({ from, to }) {
  const { data, isLoading, isError } = useAccountTimelineQuery(
    from && to ? { from, to } : {},
  );
  const rows = useMemo(() => toCumulativeRows(data), [data]);

  return (
    <ContentPanel
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
            { key: "cumulativeProfit", label: "Running profit", type: "area" },
          ]}
        />
      )}
    </ContentPanel>
  );
}

const ITEM_MEASURES = [
  { key: "profitLoss", label: "Profit" },
  { key: "jobCostTotal", label: "Cost" },
  { key: "salesTotal", label: "Sales" },
];

/** Top items by the selected measure, ranked and paged by the server. */
export function ArchiveItemChartPanel({ from, to, limit = 10 }) {
  const [sort, setSort] = useState("profitLoss");
  const { data, isLoading, isError } = useAccountTimelineItemsQuery({
    sort,
    limit,
    ...(from && to ? { from, to } : {}),
  });

  const { data: itemList } = useQuery({
    queryKey: ["cachedData", "fullItemList"],
    queryFn: getFullItemList,
    staleTime: Infinity,
  });

  const names = useMemo(() => {
    const items = data?.items ?? [];
    if (!itemList) return {};
    return Object.fromEntries(
      items.map(({ typeID }) => [typeID, itemList[typeID]?.name]),
    );
  }, [data, itemList]);

  const rows = useMemo(() => toItemRows(data, names), [data, names]);
  const measure = ITEM_MEASURES.find((m) => m.key === sort);

  return (
    <ContentPanel
      title="Top items"
      componentName="Archive Item Chart Panel"
      isLoading={isLoading}
      isError={isError}
    >
      <Stack spacing={1}>
        <Select
          size="small"
          value={sort}
          onChange={(event) => setSort(event.target.value)}
          sx={{ alignSelf: "flex-end", minWidth: 160 }}
        >
          {ITEM_MEASURES.map((option) => (
            <MenuItem key={option.key} value={option.key}>
              By {option.label.toLowerCase()}
            </MenuItem>
          ))}
        </Select>
        {rows.length === 0 ? (
          <NoData>No archived jobs in this period.</NoData>
        ) : (
          <RankedBarChart
            rows={rows}
            categoryKey="name"
            valueKey={sort}
            valueLabel={measure?.label}
            colourFor={(row) =>
              row?.[sort] < 0 ? "var(--eip-loss, #f03939)" : undefined
            }
          />
        )}
      </Stack>
    </ContentPanel>
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
export function ArchiveSegmentPanel({ typeID = 0 }) {
  const [measure, setMeasure] = useState("jobCostTotal");
  const { data, isLoading, isError } = useAccountTotalsQuery(typeID);
  const rows = useMemo(() => toSegmentRows(data, measure), [data, measure]);

  return (
    <ContentPanel
      title="Where the work went"
      componentName="Archive Segment Panel"
      isLoading={isLoading}
      isError={isError}
    >
      <Stack spacing={1}>
        <Select
          size="small"
          value={measure}
          onChange={(event) => setMeasure(event.target.value)}
          sx={{ alignSelf: "flex-end", minWidth: 160 }}
        >
          {SEGMENT_MEASURES.map((option) => (
            <MenuItem key={option.key} value={option.key}>
              By {option.label.toLowerCase()}
            </MenuItem>
          ))}
        </Select>
        {rows.length === 0 ? (
          <NoData>Nothing archived yet.</NoData>
        ) : (
          <PieChart rows={rows} categoryKey="segment" valueKey="value" />
        )}
      </Stack>
    </ContentPanel>
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
    <ContentPanel
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
    </ContentPanel>
  );
}

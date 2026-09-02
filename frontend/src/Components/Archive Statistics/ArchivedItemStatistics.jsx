import { useMemo } from "react";
import { Box, Grid, Stack, Typography } from "@mui/material";
import AppShellPanel from "../../Styled Components/Paper/AppShellPanel";
import { ArchiveRangeControl } from "./ArchiveRangeControl";
import { monthLabel, NoData } from "./panelParts";
import VirtualisedRecipeSearch from "../../Styled Components/autocomplete/virtualisedRecipeSearch";
import { TimeSeriesChart } from "../../Styled Components/Charts";
import { useAccountTotalsQuery } from "../../Hooks/React Query/Backend/statisticsTotals";
import { useArchiveTimeline } from "./useArchiveTimeline";
import {
  COST_COMPONENTS,
  toBuildCostPerUnitRows,
  COST_SERIES,
  sumTimelineMeasures,
  toCostComponentRows,
  toCumulativeRows,
  toQuantityRows,
} from "./chartAdapters";
import { formatNumberForLocale, numberToShortText } from "../../Functions/Helper/numberParser";

/** Names what the figures beneath it are counting over. */
function GroupLabel({ children }) {
  return (
    <Typography
      variant="overline"
      color="text.secondary"
      display="block"
      sx={{ mb: 0.5 }}
    >
      {children}
    </Typography>
  );
}

/** One headline number with its label. */
function Figure({ label, value, title }) {
  return (
    <Grid size={{ xs: 6, sm: 4, md: 2 }}>
      <Typography variant="caption" color="text.secondary" display="block">
        {label}
      </Typography>
      <Typography variant="subtitle1" fontWeight={600} title={title}>
        {value}
      </Typography>
    </Grid>
  );
}

const ISK = (value) => numberToShortText(Number(value ?? 0), 2);
// Counts are whole things — builds, items, units sold — so they carry no
// decimals. The formatter defaults to two, which renders a build count as
// "12.00".
const COUNT = (value) =>
  formatNumberForLocale(Number(value ?? 0), { min: 0, max: 0 });

/** A cost month as `YYYY-MM`, or a dash when the mark is unset. */
function markMonth(month) {
  const year = Number(month?.year ?? 0);
  const index = Number(month?.month ?? 0);
  if (!year || !index) return "—";
  return `${year}-${String(index).padStart(2, "0")}`;
}

/**
 * Everything the archive knows about one item.
 *
 * The figures are lifetime — they answer "what has this item ever done" — while
 * the charts follow the page's range, so a narrow window can be read against a
 * total that does not move under it. Mixing the two would make a range change
 * look like the item's history had changed.
 *
 * @param {Object} props
 * @param {string} [props.from]
 * @param {string} [props.to]
 * @param {{typeID: number, name: string}|null} props.item - the item on screen
 * @param {(item: {typeID: number, name: string}|null) => void} props.onSelectItem
 * @param {string} props.rangeKey
 * @param {(key: string) => void} props.onRangeChange
 */
export function ArchivedItemStatistics({
  from,
  to,
  range,
  item,
  onSelectItem,
  rangeKey,
  onRangeChange,
}) {
  const typeID = item?.typeID ?? null;

  const {
    data: timeline,
    months,
    isLoading,
    isError,
  } = useArchiveTimeline(
    { typeID, from, to, range, includeProductionChain: true },
    { enabled: Boolean(typeID) },
  );
  const { data: totals } = useAccountTotalsQuery(typeID, {
    enabled: Boolean(typeID),
  });

  // The client unwraps the response, and an item never built returns a zeroed
  // row rather than nothing.
  const row = totals ?? null;
  const period = useMemo(() => sumTimelineMeasures(months), [months]);
  const history = row?.history ?? null;

  // Never built, as opposed to not built in this window: the totals row is
  // lifetime, so its build count is what separates them. Only once it has
  // arrived, or a read still in flight would read as an item with no history.
  const nothingRecorded =
    Boolean(typeID) && row !== null && Number(row.totalJobs ?? 0) === 0;

  const holding = !typeID || nothingRecorded;

  const perUnit = useMemo(() => toBuildCostPerUnitRows(timeline), [timeline]);
  const quantities = useMemo(() => toQuantityRows(timeline), [timeline]);
  const components = useMemo(() => toCostComponentRows(timeline), [timeline]);
  const cumulative = useMemo(() => toCumulativeRows(timeline), [timeline]);

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: 2,
        flex: 1,
        minHeight: 0,
        width: "100%",
        minWidth: 0,
      }}
    >
      <Box>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={2}
          alignItems={{ xs: "stretch", sm: "flex-start" }}
        >
          <Box sx={{ flex: 1, minWidth: 0, maxWidth: { sm: 420 } }}>
            <VirtualisedRecipeSearch
              onSelect={(option) =>
                onSelectItem(
                  option ? { typeID: option.itemID, name: option.name } : null,
                )
              }
            />
          </Box>
          <Box sx={{ ml: { sm: "auto" } }}>
            <ArchiveRangeControl value={rangeKey} onChange={onRangeChange} />
          </Box>
        </Stack>
      </Box>

      {holding ? (
        <Box sx={{ display: "flex", flex: 1, minHeight: 0 }}>
          <AppShellPanel
            title="Item statistics"
            componentName="Archived Item Statistics"
            paperSx={{ flex: 1, display: "flex", flexDirection: "column" }}
            contentSx={{ flex: 1, display: "flex", alignItems: "flex-start" }}
          >
            <Typography variant="body2" color="text.secondary" sx={{ width: "100%" }}>
              {typeID
                ? `Nothing archived for ${item?.name ?? "this item"} yet.`
                : "Search for an item to see what it has cost and earned."}
            </Typography>
          </AppShellPanel>
        </Box>
      ) : (
        <Grid container spacing={2} sx={{ width: "100%", minWidth: 0 }}>
          <Grid size={12}>
            <AppShellPanel
              title={item?.name ?? `Type ${typeID}`}
              componentName="Archived Item Figures"
            >
              <Stack spacing={2.5}>
                <Box>
                  <GroupLabel>In this period</GroupLabel>
                  <Grid container spacing={2}>
                    <Figure label="Items produced" value={COUNT(period?.quantityProduced)} />
                    <Figure label="Items sold" value={COUNT(period?.quantitySold)} />
                    <Figure
                      label="Job cost"
                      value={ISK(period?.jobCostTotal)}
                      title={formatNumberForLocale(Number(period?.jobCostTotal ?? 0))}
                    />
                    <Figure
                      label="Sales"
                      value={ISK(period?.salesTotal)}
                      title={formatNumberForLocale(Number(period?.salesTotal ?? 0))}
                    />
                    <Figure
                      label="Profit"
                      value={ISK(period?.profitLoss)}
                      title={formatNumberForLocale(Number(period?.profitLoss ?? 0))}
                    />
                  </Grid>
                </Box>

                {/* Cost months: a job's costs belong to the month production
                    started, which can be years before it was archived. */}
                <Box>
                  <GroupLabel>All time</GroupLabel>
                  <Grid container spacing={2}>
                    <Figure label="Builds" value={COUNT(row?.totalJobs)} />
                    <Figure label="Items produced" value={COUNT(row?.itemBuildCount)} />
                    <Figure
                      label="Profit"
                      value={ISK(row?.profitLoss)}
                      title={formatNumberForLocale(Number(row?.profitLoss ?? 0))}
                    />
                    <Figure label="First build" value={markMonth(history?.firstCostMonth)} />
                    <Figure
                      label="Cheapest / item"
                      value={ISK(history?.cheapestCostPerItem)}
                      title={`${markMonth(history?.cheapestCostMonth)} — per item`}
                    />
                    <Figure
                      label="Dearest / item"
                      value={ISK(history?.dearestCostPerItem)}
                      title={`${markMonth(history?.dearestCostMonth)} — per item`}
                    />
                  </Grid>
                </Box>
              </Stack>
            </AppShellPanel>
          </Grid>

          <Grid size={{ xs: 12, lg: 6 }}>
            <AppShellPanel
              title="Cost and sale price per item"
              componentName="Archived Item Unit Costs"
              isLoading={isLoading}
              isError={isError}
            >
              {perUnit.length === 0 ? (
                <NoData>Nothing built in this period.</NoData>
              ) : (
                <TimeSeriesChart
                  rows={perUnit}
                  categoryKey="month"
                  formatCategory={monthLabel(perUnit)}
                  series={COST_SERIES}
                />
              )}
            </AppShellPanel>
          </Grid>

          <Grid size={{ xs: 12, lg: 6 }}>
            <AppShellPanel
              title="Produced and sold"
              componentName="Archived Item Quantities"
              isLoading={isLoading}
              isError={isError}
            >
              {quantities.length === 0 ? (
                <NoData>Nothing built in this period.</NoData>
              ) : (
                <TimeSeriesChart
                  rows={quantities}
                  categoryKey="month"
                  formatCategory={monthLabel(quantities)}
                  formatValue={COUNT}
                  series={[
                    { key: "quantityProduced", label: "Produced", type: "bar" },
                    { key: "quantitySold", label: "Sold", type: "bar" },
                  ]}
                />
              )}
            </AppShellPanel>
          </Grid>

          <Grid size={{ xs: 12, lg: 6 }}>
            <AppShellPanel
              title="Cost composition"
              componentName="Archived Item Cost Composition"
              isLoading={isLoading}
              isError={isError}
            >
              {components.length === 0 ? (
                <NoData>Nothing built in this period.</NoData>
              ) : (
                <TimeSeriesChart
                  rows={components}
                  categoryKey="month"
                  formatCategory={monthLabel(components)}
                  series={COST_COMPONENTS.map(({ key, label }) => ({
                    key,
                    label,
                    type: "bar",
                    stackId: "cost",
                  }))}
                />
              )}
            </AppShellPanel>
          </Grid>

          <Grid size={{ xs: 12, lg: 6 }}>
            <AppShellPanel
              title="Profit by month"
              componentName="Archived Item Profit"
              isLoading={isLoading}
              isError={isError}
            >
              {cumulative.length === 0 ? (
                <NoData>Nothing built in this period.</NoData>
              ) : (
                // The running total needs its own axis: it outgrows a single
                // month and would flatten the bars onto the floor.
                <TimeSeriesChart
                  rows={cumulative}
                  categoryKey="month"
                  formatCategory={monthLabel(cumulative)}
                  rightAxisLabel="Running total"
                  series={[
                    { key: "profitLoss", label: "Profit", type: "bar", role: "profit" },
                    {
                      key: "cumulativeProfit",
                      label: "Running total",
                      type: "line",
                      axis: "right",
                    },
                  ]}
                />
              )}
            </AppShellPanel>
          </Grid>
        </Grid>
      )}
    </Box>
  );
}

export default ArchivedItemStatistics;

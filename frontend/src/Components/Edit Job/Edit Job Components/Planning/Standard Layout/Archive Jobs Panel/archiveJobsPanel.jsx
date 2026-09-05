import { useMemo, useState } from "react";
import {
  Box,
  Collapse,
  Divider,
  Fade,
  Grid,
  Link,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import AppShellPanel from "../../../../../../Styled Components/Paper/AppShellPanel";
import {
  TimeSeriesChart,
  timeSeriesSurfaceStyle,
} from "../../../../../../Styled Components/Charts";
import { appShellInsetSurfaceSx } from "../../../../../../Context/appShell";
import useUsersStore from "../../../../../../Zustand/usersStore";
import {
  formatNumberForLocale,
  numberToShortText,
} from "../../../../../../Functions/Helper/numberParser";
import { useAccountTotalsQuery } from "../../../../../../Hooks/React Query/Backend/statisticsTotals";
import { useAccountTimelineQuery } from "../../../../../../Hooks/React Query/Backend/statisticsTimeline";
import {
  COST_SERIES,
  toBuildCostPerUnitRows,
} from "../../../../../../Components/Archive Statistics/chartAdapters";
import {
  costRange,
  historyWindow,
  monthLabel,
  outputDestinations,
  shortMonthLabel,
} from "./buildHistoryFigures";

const labelSx = {
  typography: { xs: "caption", md: "body2" },
  color: "text.secondary",
};

const figureSx = {
  typography: { xs: "body2", md: "body1" },
  fontWeight: 600,
  lineHeight: 1.3,
};

function Figure({ label, value, title, note, noteColor }) {
  const figure = <Typography sx={figureSx}>{value}</Typography>;

  return (
    <Grid size={{ xs: 6, sm: 3 }}>
      <Typography sx={labelSx}>{label}</Typography>
      {title ? (
        <Tooltip title={title} arrow placement="top">
          <Box sx={{ width: "fit-content" }}>{figure}</Box>
        </Tooltip>
      ) : (
        figure
      )}
      {note ? (
        <Typography
          sx={{ typography: "caption", color: noteColor ?? "text.secondary" }}
        >
          {note}
        </Typography>
      ) : null}
    </Grid>
  );
}

function ComparisonStrip({ history }) {
  const range = costRange(history);
  const builds = Number(history?.buildCount ?? 0);

  return (
    <Grid container spacing={2} size={12}>
      <Figure
        label="Builds"
        value={formatNumberForLocale(builds, { max: 0 })}
        note={builds > 0 ? `since ${monthLabel(history.firstCostMonth)}` : null}
      />
      <Figure
        label="Last build"
        value={
          builds > 0 ? formatNumberForLocale(history.lastCostPerItem) : "—"
        }
        title={builds > 0 ? numberToShortText(history.lastCostPerItem) : null}
        note={builds > 0 ? monthLabel(history.lastCostMonth) : "no builds yet"}
      />
      <Figure
        label="Average"
        value={builds > 0 ? formatNumberForLocale(averageOf(history)) : "—"}
        title={builds > 0 ? numberToShortText(averageOf(history)) : null}
      />
      <Figure
        label="Range"
        value={
          range
            ? `${formatNumberForLocale(range.low)} – ${formatNumberForLocale(range.high)}`
            : "—"
        }
        title={
          range
            ? `${numberToShortText(range.low)} – ${numberToShortText(range.high)}`
            : null
        }
        note={range ? `spread ${formatNumberForLocale(range.spread)}` : null}
      />
    </Grid>
  );
}

/**
 * The mean of the marks' two ends stands in for a lifetime average: the marks are
 * fixed scalars, and averaging them needs no second read.
 */
function averageOf(history) {
  const low = Number(history?.cheapestCostPerItem ?? 0);
  const high = Number(history?.dearestCostPerItem ?? 0);
  return (low + high) / 2;
}

function DestinationSplit({ totals }) {
  const { rows, total } = outputDestinations(totals);
  if (total <= 0) return null;

  return (
    <Grid size={12}>
      <Typography sx={labelSx}>Where output went</Typography>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5, mt: 0.5 }}>
        {rows.map((row) => (
          <Box
            key={row.key}
            sx={{ display: "flex", justifyContent: "space-between", gap: 2 }}
          >
            <Typography sx={{ typography: "body2" }}>{row.label}</Typography>
            <Typography sx={{ typography: "body2", fontWeight: 600 }}>
              {formatNumberForLocale(row.quantity, { max: 0 })}
            </Typography>
          </Box>
        ))}
      </Box>
    </Grid>
  );
}

export default function ArchiveJobsPanel({ state }) {
  const isLoggedIn = useUsersStore((s) => s.account.isLoggedIn);
  const typeID = state.activeJob?.itemID;
  const [showChart, setShowChart] = useState(false);

  const {
    data: totalsData,
    isLoading,
    isError,
    error,
  } = useAccountTotalsQuery(typeID);

  const history = totalsData?.history;
  const hasHistory = Number(history?.buildCount ?? 0) > 0;

  const theme = useTheme();
  const deviceNotMobile = useMediaQuery(theme.breakpoints.up("sm"));
  const chartSurfaceSx = useMemo(
    () => timeSeriesSurfaceStyle(deviceNotMobile),
    [deviceNotMobile],
  );

  // Chain output counts: an item built only as an intermediate still has a cost
  // history, and it is the one its builder wants to compare against.
  const window = useMemo(() => historyWindow(history), [history]);
  const { data: timelineData, isLoading: chartLoading } =
    useAccountTimelineQuery(
      { ...window, typeID, includeProductionChain: true },
      { enabled: showChart && hasHistory && Boolean(window) },
    );

  // Opening waits for the rows: a collapse that grows once to the finished chart
  // reads as one movement, where growing to a loading state and again to the
  // chart reads as a jump.
  const chartOpening = showChart && chartLoading;
  const chartReady = showChart && !chartLoading;

  const chartRows = useMemo(
    () => toBuildCostPerUnitRows(timelineData),
    [timelineData],
  );

  return (
    <AppShellPanel
      visible={isLoggedIn}
      title="Build History"
      // Masonry lays its children out by natural height, so the panel cannot take
      // the full-height default meant for panels sharing a grid row.
      paperSx={{ height: "auto" }}
      componentName="Archive Jobs Panel"
      isLoading={isLoading}
      isError={isError}
      error={error}
      loadingMessage="Loading archived data…"
    >
      {!hasHistory ? (
        <Typography sx={{ typography: "body2" }} align="center">
          You have not archived a build of this item yet.
        </Typography>
      ) : (
        <Fade in appear timeout={400}>
          <Grid container spacing={2} sx={{ width: "100%" }}>
            <ComparisonStrip history={history} />

            <Grid size={12}>
              <Divider />
            </Grid>

            <Grid size={12}>
              <Link
                component="button"
                type="button"
                underline="hover"
                onClick={() => setShowChart((open) => !open)}
                sx={{ typography: "body2" }}
              >
                {chartOpening
                  ? "Loading cost over time…"
                  : showChart
                    ? "Hide cost over time"
                    : "Show cost over time"}
              </Link>
              <Collapse in={chartReady} timeout={350} unmountOnExit>
                <Box sx={[appShellInsetSurfaceSx, { mt: 1, p: 1.5 }]}>
                  {/* The chart sizes itself from its container, which it can only
                      measure once laid out. Holding that height here keeps the
                      collapse growing to the size the chart settles at. */}
                  <Box sx={chartSurfaceSx}>
                    {chartRows.length === 0 ? (
                      <Typography sx={{ typography: "body2" }} align="center">
                        No monthly figures for this item yet.
                      </Typography>
                    ) : (
                      <TimeSeriesChart
                        rows={chartRows}
                        categoryKey="month"
                        series={COST_SERIES}
                        formatCategory={shortMonthLabel}
                        leftAxisLabel="Cost per unit"
                      />
                    )}
                  </Box>
                </Box>
              </Collapse>
            </Grid>

            <DestinationSplit totals={totalsData} />
          </Grid>
        </Fade>
      )}
    </AppShellPanel>
  );
}

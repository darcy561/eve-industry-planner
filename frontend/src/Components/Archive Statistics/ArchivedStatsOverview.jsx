import { Grid, Paper, Skeleton, Tooltip, Typography } from "@mui/material";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import RemoveIcon from "@mui/icons-material/Remove";
import { appShellSetupSectionPaperSx } from "../../Context/appShell";
import {
  formatNumberForLocale,
  numberToShortText,
} from "../../Functions/Helper/numberParser";
import { useAccountTimelineQuery } from "../../Hooks/React Query/Backend/statisticsTimeline";

/**
 * Percentage change from previous to current.
 *
 * Returns null when the previous month is zero: every change from nothing is an
 * infinite increase, and showing one would make a first month of activity look
 * like a result rather than a start.
 *
 * @param {number} current
 * @param {number} previous
 */
function percentChange(current, previous) {
  const baseline = Math.abs(previous);
  if (baseline < Number.EPSILON) return null;
  return ((current - previous) / baseline) * 100;
}

/**
 * Direction, colour and arrow for a change.
 *
 * Spend rising is not the same kind of news as profit rising, so the caller says
 * which direction is favourable rather than this assuming bigger is better.
 *
 * @param {number} current
 * @param {number} previous
 * @param {"up"|"down"} favourable
 */
function changeDisplay(current, previous, favourable) {
  const amount = current - previous;
  const isFlat = Math.abs(amount) < Number.EPSILON;
  const isUp = amount > 0;

  let tone = "text.primary";
  if (!isFlat) {
    const isGood = favourable === "up" ? isUp : !isUp;
    tone = isGood ? "success.main" : "error.main";
  }

  const percent = percentChange(current, previous);
  const label =
    percent == null
      ? "—"
      : `${percent >= 0 ? "+" : ""}${formatNumberForLocale(percent, { min: 1, max: 1 })}%`;

  const ArrowIcon = isFlat
    ? RemoveIcon
    : isUp
      ? ArrowUpwardIcon
      : ArrowDownwardIcon;
  return { tone, label, ArrowIcon };
}

/**
 * One measure: where the month stands so far, against the whole of last month.
 *
 * The current figure is a month-to-date total, so it is expected to trail a
 * finished month early on. That is the comparison working, not a decline — the
 * card says "so far this month" rather than dressing a partial total as a final
 * one.
 */
function MetricCard({ label, value, previousValue, favourable, isLoading }) {
  if (isLoading) {
    return (
      <Paper variant="outlined" sx={{ ...appShellSetupSectionPaperSx, p: 2 }}>
        <Skeleton width="60%" />
        <Skeleton width="80%" height={36} />
        <Skeleton width="70%" />
      </Paper>
    );
  }

  const {
    tone,
    label: changeLabel,
    ArrowIcon,
  } = changeDisplay(value, previousValue, favourable);

  return (
    <Paper variant="outlined" sx={{ ...appShellSetupSectionPaperSx, p: 2 }}>
      <Typography
        color="text.secondary"
        sx={{ typography: { xs: "caption", md: "body2" } }}
      >
        {label}
      </Typography>
      <Grid container wrap="nowrap" sx={{ mt: 0.5, alignItems: "center" }}>
        <ArrowIcon sx={{ fontSize: 16, mr: 0.5, color: tone }} />
        <Tooltip title={numberToShortText(value, 2)} arrow placement="top">
          <Typography
            sx={{
              typography: { xs: "h6", md: "h5" },
              width: "fit-content",
              lineHeight: 1.2,
              color: tone,
            }}
          >
            {formatNumberForLocale(value)}
          </Typography>
        </Tooltip>
        <Typography
          sx={{ typography: "caption", ml: 0.75, lineHeight: 1.2, color: tone }}
        >
          {changeLabel}
        </Typography>
      </Grid>
      <Tooltip
        title={numberToShortText(previousValue, 2)}
        arrow
        placement="top"
      >
        <Typography
          sx={{
            typography: "caption",
            mt: 0.25,
            width: "fit-content",
            color: "text.secondary",
          }}
        >
          Last month: {formatNumberForLocale(previousValue)}
        </Typography>
      </Tooltip>
    </Paper>
  );
}

/**
 * Where this month stands against the last one.
 *
 * A running position rather than a settled result: the current month is still
 * accumulating, so the figures are month-to-date and the comparison shows
 * progress against a completed month. Charts over finished months are a separate
 * view.
 *
 * With no range, the server picks the window: the current month and the one
 * before it, which is the comparison this view exists to make. A caller with its
 * own range control passes one so the cards agree with what it shows elsewhere.
 *
 * @param {Object} [props]
 * @param {string} [props.from] - YYYY-MM
 * @param {string} [props.to] - YYYY-MM
 */
export function ArchivedStatsOverview({ from, to } = {}) {
  const { data, isLoading } = useAccountTimelineQuery(
    from && to ? { from, to } : {},
  );

  const months = data?.months ?? [];
  // Ascending from the server, so the last entry is the month in progress. Read
  // from the end rather than by index: an account with one month of history
  // returns a single entry, and treating it as the previous month would compare
  // this month against itself.
  const current = months.at(-1) ?? {};
  const previous = months.length > 1 ? months.at(-2) : {};

  const measures = [
    {
      label: "Amount Spent",
      // jobCostTotal already carries both fee totals, so adding them here counts
      // them twice.
      value: Number(current.jobCostTotal ?? 0),
      previousValue: Number(previous.jobCostTotal ?? 0),
      favourable: "down",
    },
    {
      label: "Amount Received",
      value: Number(current.salesTotal ?? 0),
      previousValue: Number(previous.salesTotal ?? 0),
      favourable: "up",
    },
    {
      label: "Profit / Loss",
      value: Number(current.profitLoss ?? 0),
      previousValue: Number(previous.profitLoss ?? 0),
      favourable: "up",
    },
  ];

  return (
    <Grid container spacing={1.5} size={12}>
      <Grid size={12}>
        <Typography
          sx={{
            typography: { xs: "caption", md: "body2" },
            color: "text.secondary",
          }}
        >
          So far this month
        </Typography>
      </Grid>
      {measures.map((measure) => (
        <Grid key={measure.label} size={{ xs: 12, sm: 4 }}>
          <MetricCard {...measure} isLoading={isLoading} />
        </Grid>
      ))}
    </Grid>
  );
}

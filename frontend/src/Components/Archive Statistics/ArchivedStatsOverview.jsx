import { Grid, Paper, Skeleton, Tooltip, Typography } from "@mui/material";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import RemoveIcon from "@mui/icons-material/Remove";
import { appShellSetupSectionPaperSx } from "../../Context/appShell";
import {
  formatNumberForLocale,
  numberToShortText,
} from "../../Functions/Helper/numberParser";
import { useArchiveTimeline } from "./useArchiveTimeline";

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
 * What a month cost, fees included.
 *
 * A timeline month's `jobCostTotal` is build cost alone and carries the two
 * selling fees separately, so spend read straight off it leaves received minus
 * spent larger than the profit beside it. The lifetime totals row spells the
 * same field the other way, fees included.
 *
 * @param {Object} month
 */
function spend(month) {
  return (
    Number(month?.jobCostTotal ?? 0) +
    Number(month?.brokersFeeTotal ?? 0) +
    Number(month?.transactionFeeTotal ?? 0)
  );
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
function MetricCard({
  label,
  value,
  previousValue,
  favourable,
  signed = false,
  isLoading,
}) {
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

  // The figure says what it is; the arrow says how it compares. Only a signed
  // measure has a good and a bad side of zero — spend is a magnitude.
  const valueTone = !signed
    ? "text.primary"
    : value < 0
      ? "error.main"
      : "success.main";

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
              color: valueTone,
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
 * The row for a month relative to this one, or nothing recorded for it.
 *
 * Buckets are filed against UTC month boundaries, so the month being asked for
 * is resolved there too.
 *
 * @param {Object[]} months
 * @param {number} offset - 0 for this month, -1 for the one before
 */
function monthOn(months, offset, now = new Date()) {
  const shifted = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1),
  );
  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth() + 1;
  return months.find((row) => row.year === year && row.month === month) ?? {};
}

/**
 * Where this month stands against the last one.
 *
 * A running position rather than a settled result: the current month is still
 * accumulating, so the figures are month-to-date and the comparison shows
 * progress against a completed month. Charts over finished months are a separate
 * view.
 *
 * It takes no window. The comparison is always this calendar month against the
 * last one, so a period chosen for the panels elsewhere does not move it.
 */
export function ArchivedStatsOverview() {
  // Not narrowed by the page's period: the heading promises this month against
  // last, whatever the panels beneath are drawing.
  const { months, isLoading } = useArchiveTimeline();
  // Matched on the calendar, not on position: a month with nothing archived in
  // it has no row at all, so the newest row returned can be a month or more old
  // and would otherwise be read as this one.
  const current = monthOn(months, 0);
  const previous = monthOn(months, -1);

  const measures = [
    {
      label: "Amount Spent",
      value: spend(current),
      previousValue: spend(previous),
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
      // The only one of the three whose sign is a verdict rather than a size.
      signed: true,
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

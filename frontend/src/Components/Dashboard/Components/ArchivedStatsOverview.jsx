import { FormControl, Grid, MenuItem, Paper, Select, Tooltip, Typography, useTheme } from "@mui/material";
import { useMemo, useState } from "react";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import RemoveIcon from "@mui/icons-material/Remove";
import { useQuery } from "@tanstack/react-query";
import getPersonalBuildStatsRollup from "../../../Functions/Endpoints/Pirivate/buildStatsRollup";
import getCorpBuildStatsRollup from "../../../Functions/Endpoints/Pirivate/corpBuildStatsRollup";
import { formatNumberForLocale, numberToShortText } from "../../../Functions/Helper/numberParser";
import { appShellOutlinedFormControl, appShellSetupSectionPaperSx, getAppShellSelectMenuProps } from "../../../Context/appShell";
import useUsersStore from "../../../Zustand/usersStore";

function toMonthPeriod(date) {
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
  };
}

function previousMonth(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1));
}

function metricDelta(current, previous) {
  const cur = Number(current ?? 0);
  const prev = Number(previous ?? 0);
  const baseline = Math.abs(prev);
  if (baseline < Number.EPSILON) {
    return { amount: cur - prev, percent: null };
  }
  return {
    amount: cur - prev,
    percent: ((cur - prev) / baseline) * 100,
  };
}

function deltaDisplay(current, previous) {
  const delta = metricDelta(current, previous);
  const isPositive = delta.amount >= 0;
  const isNeutral = Math.abs(delta.amount) < Number.EPSILON;
  const tone = isNeutral ? "text.primary" : isPositive ? "primary.main" : "error.main";
  const signedPercent = delta.percent == null
    ? "N/A"
    : `${isPositive ? "+" : ""}${formatNumberForLocale(delta.percent, { min: 1, max: 1 })}%`;
  const ArrowIcon = isNeutral
    ? RemoveIcon
    : isPositive
      ? ArrowUpwardIcon
      : ArrowDownwardIcon;
  return { tone, signedPercent, ArrowIcon };
}

function MetricCard({ label, value, previousValue}) {
  const tooltipValue = numberToShortText(value, 2);
  const previousTooltipValue = numberToShortText(previousValue, 2);
  const { tone, signedPercent, ArrowIcon } = deltaDisplay(value, previousValue);
  return (
    <Paper variant="outlined" sx={{ ...appShellSetupSectionPaperSx, p: 2 }}>
      <Typography color="text.secondary" sx={{ typography: { xs: "caption", md: "body2" } }}>
        {label}
      </Typography>
      <Grid container wrap="nowrap" sx={{ mt: 0.5, alignItems: "center" }}>
        <ArrowIcon sx={{ fontSize: 16, mr: 0.5, color: tone }} />
        <Tooltip title={tooltipValue} arrow placement="top">
          <Typography sx={{ typography: { xs: "h6", md: "h5" }, width: "fit-content", lineHeight: 1.2, color: tone }}>
            {formatNumberForLocale(value)}
          </Typography>
        </Tooltip>
        <Typography sx={{ typography: "caption", ml: 0.75, lineHeight: 1.2, color: tone }}>
          {signedPercent}
        </Typography>
      </Grid>
      <Tooltip title={previousTooltipValue} arrow placement="top">
        <Typography sx={{ typography: "caption", mt: 0.25, width: "fit-content", color: "text.secondary" }}>
          Previous month: {formatNumberForLocale(previousValue)}
        </Typography>
      </Tooltip>
    </Paper>
  );
}

export function ArchivedStatsOverview() {
  const theme = useTheme();
  const now = useMemo(() => new Date(), []);
  const corporations = useUsersStore((state) => state.account.corporations) ?? [];
  const corporationOptions = useMemo(
    () =>
      corporations
        .map((corp) => ({
          id: String(corp?.corporation_id ?? "").trim(),
          name: corp?.corporationName ?? `Corporation ${corp?.corporation_id ?? ""}`,
        }))
        .filter((corp) => corp.id !== ""),
    [corporations]
  );
  const [selectedScope, setSelectedScope] = useState("personal");
  const currentPeriod = useMemo(() => toMonthPeriod(now), [now]);
  const previousPeriod = useMemo(() => toMonthPeriod(previousMonth(now)), [now]);

  const selectedCorporationID =
    selectedScope.startsWith("corp:") ? selectedScope.split(":")[1] : "";

  const currentQuery = useQuery({
    queryKey: [
      "dashboard",
      "archivedRollup",
      selectedScope,
      "month",
      currentPeriod.year,
      currentPeriod.month,
    ],
    queryFn: () =>
      selectedScope === "personal"
        ? getPersonalBuildStatsRollup({ period: currentPeriod })
        : getCorpBuildStatsRollup({
            corporationID: selectedCorporationID,
            period: currentPeriod,
          }),
    staleTime: 60 * 1000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    enabled: selectedScope === "personal" || !!selectedCorporationID,
  });

  const previousQuery = useQuery({
    queryKey: [
      "dashboard",
      "archivedRollup",
      selectedScope,
      "month",
      previousPeriod.year,
      previousPeriod.month,
    ],
    queryFn: () =>
      selectedScope === "personal"
        ? getPersonalBuildStatsRollup({ period: previousPeriod })
        : getCorpBuildStatsRollup({
            corporationID: selectedCorporationID,
            period: previousPeriod,
          }),
    staleTime: 60 * 1000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    enabled: selectedScope === "personal" || !!selectedCorporationID,
  });

  const currentTotals = currentQuery.data?.totals ?? {};
  const previousTotals = previousQuery.data?.totals ?? {};

  const spentNow =
    Number(currentTotals.jobCostTotal ?? 0) +
    Number(currentTotals.brokersFeeTotal ?? 0) +
    Number(currentTotals.transactionFeeTotal ?? 0);
  const spentPrev =
    Number(previousTotals.jobCostTotal ?? 0) +
    Number(previousTotals.brokersFeeTotal ?? 0) +
    Number(previousTotals.transactionFeeTotal ?? 0);
  const receivedNow = Number(currentTotals.salesTotal ?? 0);
  const receivedPrev = Number(previousTotals.salesTotal ?? 0);
  const profitNow = Number(currentTotals.profitLoss ?? 0);
  const profitPrev = Number(previousTotals.profitLoss ?? 0);

  const isLoading = currentQuery.isLoading || previousQuery.isLoading;

  return (
    <Grid container spacing={1.5} size={12}>
      <Grid container size={12} spacing={1.5} sx={{ alignItems: "center" }}>
        <Grid size={{ xs: 12, sm: 7, md: 8 }}>
        <Typography sx={{ typography: { xs: "caption", md: "body2" }, color: "text.secondary" }}>
          Archived Monthly Snapshot
        </Typography>
        </Grid>
        <Grid size={{ xs: 12, sm: 5, md: 4 }}>
          <FormControl fullWidth size="small" sx={(t) => ({ ...appShellOutlinedFormControl(t) })}>
            <Select
              value={selectedScope}
              onChange={(e) => setSelectedScope(String(e.target.value))}
              MenuProps={getAppShellSelectMenuProps(theme)}
            >
              <MenuItem value="personal">Personal</MenuItem>
              {corporationOptions.map((corp) => (
                <MenuItem key={corp.id} value={`corp:${corp.id}`}>
                  {corp.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
      </Grid>
      <Grid size={{ xs: 12, sm: 4 }}>
        <MetricCard
          label="Amount Spent"
          value={isLoading ? 0 : spentNow}
          previousValue={isLoading ? 0 : spentPrev}
        />
      </Grid>
      <Grid size={{ xs: 12, sm: 4 }}>
        <MetricCard
          label="Amount Received"
          value={isLoading ? 0 : receivedNow}
          previousValue={isLoading ? 0 : receivedPrev}
        />
      </Grid>
      <Grid size={{ xs: 12, sm: 4 }}>
        <MetricCard
          label="Profit / Loss"
          value={isLoading ? 0 : profitNow}
          previousValue={isLoading ? 0 : profitPrev}
        />
      </Grid>
    </Grid>
  );
}

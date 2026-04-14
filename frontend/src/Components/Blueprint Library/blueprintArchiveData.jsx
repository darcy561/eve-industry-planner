import {
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  Grid,
  Typography,
} from "@mui/material";
import { useEffect, useRef } from "react";
import { getAnalytics, logEvent } from "firebase/analytics";
import useUsersStore from "../../Zustand/usersStore";
import { formatNumberForLocale } from "../../Functions/Helper/numberParser";
import { useBuildStatsQuery } from "../../Hooks/React Query/Backend/buildStats";

const labelCol = { xs: 12, sm: 6 };
const valueCol = { xs: 12, sm: 6 };

function StatRow({ label, children }) {
  return (
    <Grid container size={12}>
      <Grid size={labelCol}>
        <Typography>{label}</Typography>
      </Grid>
      <Grid align="right" size={valueCol}>
        {children}
      </Grid>
    </Grid>
  );
}

function DialogLoadingBody() {
  return (
    <DialogContent>
      <Grid container>
        <Grid align="center" size={12}>
          <CircularProgress color="primary" />
        </Grid>
        <Grid align="center" size={12}>
          <Typography>Loading...</Typography>
        </Grid>
      </Grid>
    </DialogContent>
  );
}

/** True when the API returned a real aggregate vs an empty placeholder for “no stats yet”. */
function hasMeaningfulBuildStats(data) {
  if (!data) return false;
  if ((data.totalJobs ?? 0) > 0) return true;
  if ((data.itemBuildCount ?? 0) > 0) return true;
  return Array.isArray(data.dataSnapshots) && data.dataSnapshots.length > 0;
}

function ArchiveStatsSummary({ data }) {
  const avgItemCost =
    data.itemBuildCount > 0
      ? formatNumberForLocale(
          ((data.jobCostTotal / data.itemBuildCount + Number.EPSILON) * 100) /
            100
        )
      : formatNumberForLocale(0);

  return (
    <DialogContent>
      <Grid container>
        <StatRow label="Total Jobs:">
          <Typography>{data.totalJobs}</Typography>
        </StatRow>
        <StatRow label="Total Items Built:">
          <Typography>
            {formatNumberForLocale(data.itemBuildCount, { max: 0 })}
          </Typography>
        </StatRow>
        <StatRow label="Average Item Cost:">
          <Typography>{avgItemCost}</Typography>
        </StatRow>
        <StatRow label="Job Cost Total:">
          <Typography>{formatNumberForLocale(data.jobCostTotal)}</Typography>
        </StatRow>
        <StatRow label="Sales Total:">
          <Typography>{formatNumberForLocale(data.salesTotal)}</Typography>
        </StatRow>
        <StatRow label="Brokers Fee Total:">
          <Typography>{formatNumberForLocale(data.brokersFeeTotal)}</Typography>
        </StatRow>
        <StatRow label="Transaction Fee Total:">
          <Typography>
            {formatNumberForLocale(data.transactionFeeTotal)}
          </Typography>
        </StatRow>
        <StatRow label="Profit/Loss:">
          <Typography
            color={data.profitLoss >= 0 ? "primary" : "error"}
          >
            {formatNumberForLocale(data.profitLoss)}
          </Typography>
        </StatRow>
      </Grid>
    </DialogContent>
  );
}

export function ArchiveBpData({ archiveOpen, updateArchiveOpen, bpData }) {
  const isLoggedIn = useUsersStore((state) => state.account.isLoggedIn);
  const analytics = getAnalytics();
  const analyticsLoggedRef = useRef(false);

  const { data, isLoading } = useBuildStatsQuery(bpData?.itemID, {
    enabled: archiveOpen && !!bpData,
  });

  useEffect(() => {
    if (!archiveOpen) {
      analyticsLoggedRef.current = false;
    }
  }, [archiveOpen]);

  useEffect(() => {
    if (
      !archiveOpen ||
      !bpData ||
      !isLoggedIn ||
      isLoading ||
      analyticsLoggedRef.current
    ) {
      return;
    }
    analyticsLoggedRef.current = true;
    logEvent(analytics, "View Archived Job Data", {
      UID: useUsersStore.getState().account.actions.getAccountID(),
    });
  }, [archiveOpen, bpData, isLoading, isLoggedIn, analytics]);

  let body = null;
  if (!isLoggedIn) {
    body = (
      <DialogContent>
        <Grid align="center">
          <Typography>Sign in to view archived job statistics.</Typography>
        </Grid>
      </DialogContent>
    );
  } else if (isLoading) {
    body = <DialogLoadingBody />;
  } else if (hasMeaningfulBuildStats(data)) {
    body = <ArchiveStatsSummary data={data} />;
  } else {
    body = (
      <DialogContent>
        <Grid align="center">
          <Typography>
            You have no archived jobs matching this item type.
          </Typography>
        </Grid>
      </DialogContent>
    );
  }

  return (
    <Dialog
      open={archiveOpen}
      onClose={() => updateArchiveOpen(false)}
      disableEnforceFocus={false}
      disableAutoFocus={false}
      sx={{ padding: "20px" }}
    >
      <DialogTitle align="center" color="primary" sx={{ marginBottom: "20px" }}>
        {bpData?.name || "Blueprint"} Archived Data
      </DialogTitle>
      {body}
    </Dialog>
  );
}

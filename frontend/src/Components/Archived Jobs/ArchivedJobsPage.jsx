import { useMemo, useState } from "react";
import { Box, Grid, Tab, Tabs, useMediaQuery } from "@mui/material";
import DefaultPageLayout from "../../Styled Components/defaultPageLayout";
import {
  ArchiveCostBreakdownPanel,
  ArchiveCostTotalsPanel,
  ArchiveCumulativePanel,
  ArchiveExtrasPanel,
  ArchiveExtrasTotalsPanel,
  ArchiveItemChartPanel,
  ArchiveSegmentPanel,
  ArchiveTimelinePanel,
  ArchivedItemBreakdown,
  ArchivedStatsOverview,
} from "../Archive Statistics";
import {
  ArchiveRangeControl,
  resolveArchiveRange,
} from "../Archive Statistics/ArchiveRangeControl";
import { ArchivedJobsList } from "./ArchivedJobsList";

const TAB_STATISTICS = "statistics";
const TAB_JOBS = "jobs";

/**
 * Archived jobs: what the archive is worth, and what can be brought back.
 *
 * The two halves are tabs rather than one scroll because they answer different
 * questions and cost different amounts. Statistics reads aggregates the server
 * has already folded; the job list is a page of rows plus a count plus a second
 * read for the figures behind them. Most visits are for the charts, so the list
 * is not queried until its tab is opened.
 */
export function ArchivedJobsPage() {
  const deviceNotMobile = useMediaQuery((theme) => theme.breakpoints.up("sm"));
  const [tab, setTab] = useState(TAB_STATISTICS);
  const [rangeKey, setRangeKey] = useState("default");
  const range = useMemo(() => resolveArchiveRange(rangeKey), [rangeKey]);

  // Once opened the tab stays mounted, so switching back does not re-query.
  const [jobsOpened, setJobsOpened] = useState(false);
  const openTab = (_event, next) => {
    setTab(next);
    if (next === TAB_JOBS) setJobsOpened(true);
  };

  return (
    <DefaultPageLayout>
      <Grid container spacing={2} sx={{ flex: 1, width: "100%", minWidth: 0 }}>
        <Grid size={12}>
          <Tabs
            value={tab}
            onChange={openTab}
            variant={deviceNotMobile ? "standard" : "fullWidth"}
            sx={{ width: "100%" }}
          >
            <Tab label="Statistics" value={TAB_STATISTICS} />
            <Tab label="Archived Jobs" value={TAB_JOBS} />
          </Tabs>
        </Grid>

        {tab === TAB_STATISTICS && (
          <Grid size={12}>
            <Box
              sx={{
                display: "flex",
                justifyContent: { xs: "stretch", sm: "flex-end" },
              }}
            >
              <ArchiveRangeControl value={rangeKey} onChange={setRangeKey} />
            </Box>
          </Grid>
        )}

        <Grid
          size={12}
          sx={{ display: tab === TAB_STATISTICS ? "block" : "none" }}
        >
          <Grid container spacing={2} sx={{ width: "100%", minWidth: 0 }}>
            <Grid size={12}>
              <ArchivedStatsOverview {...range} />
            </Grid>
            <Grid size={{ xs: 12, lg: 6 }}>
              <ArchiveTimelinePanel {...range} />
            </Grid>
            <Grid size={{ xs: 12, lg: 6 }}>
              <ArchiveCumulativePanel {...range} />
            </Grid>
            <Grid size={{ xs: 12, lg: 6 }}>
              <ArchiveSegmentPanel />
            </Grid>
            <Grid size={{ xs: 12, lg: 6 }}>
              <ArchiveItemChartPanel {...range} />
            </Grid>
            <Grid size={{ xs: 12, lg: 6 }}>
              <ArchiveExtrasPanel {...range} />
            </Grid>
            <Grid size={{ xs: 12, lg: 6 }}>
              <ArchiveExtrasTotalsPanel {...range} />
            </Grid>
            <Grid size={{ xs: 12, lg: 6 }}>
              <ArchiveCostBreakdownPanel {...range} />
            </Grid>
            <Grid size={{ xs: 12, lg: 6 }}>
              <ArchiveCostTotalsPanel {...range} />
            </Grid>
            <Grid size={12}>
              <ArchivedItemBreakdown {...range} />
            </Grid>
          </Grid>
        </Grid>

        <Grid size={12} sx={{ display: tab === TAB_JOBS ? "block" : "none" }}>
          <Grid container spacing={2} sx={{ width: "100%", minWidth: 0 }}>
            <Grid size={12}>
              {jobsOpened && <ArchivedJobsList enabled={jobsOpened} />}
            </Grid>
          </Grid>
        </Grid>
      </Grid>
    </DefaultPageLayout>
  );
}

export default ArchivedJobsPage;

import { useMemo, useState } from "react";
import { Grid, Stack, Tab, Tabs } from "@mui/material";
import DefaultPageLayout from "../../Styled Components/defaultPageLayout";
import {
  ArchiveCumulativePanel,
  ArchiveExtrasPanel,
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
      <Grid container size={12} spacing={2}>
        <Grid size={12}>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={2}
            justifyContent="space-between"
            alignItems={{ xs: "stretch", sm: "center" }}
          >
            <Tabs value={tab} onChange={openTab}>
              <Tab label="Statistics" value={TAB_STATISTICS} />
              <Tab label="Archived Jobs" value={TAB_JOBS} />
            </Tabs>
            {tab === TAB_STATISTICS && (
              <ArchiveRangeControl value={rangeKey} onChange={setRangeKey} />
            )}
          </Stack>
        </Grid>

        <Grid
          size={12}
          sx={{ display: tab === TAB_STATISTICS ? "block" : "none" }}
        >
          <Grid container spacing={2}>
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
            <Grid size={12}>
              <ArchivedItemBreakdown {...range} />
            </Grid>
          </Grid>
        </Grid>

        <Grid size={12} sx={{ display: tab === TAB_JOBS ? "block" : "none" }}>
          <Grid container spacing={2}>
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

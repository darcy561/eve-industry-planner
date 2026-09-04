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
  ArchivedItemStatistics,
  ArchivedStatsOverview,
  RecalculationNotice,
} from "../Archive Statistics";
import {
  ArchiveRangeControl,
  resolveArchiveRange,
} from "../Archive Statistics/ArchiveRangeControl";
import { ArchivedJobsList } from "./ArchivedJobsList";

const TAB_STATISTICS = "statistics";
const TAB_ITEM = "item";
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
  const [itemOpened, setItemOpened] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const openTab = (_event, next) => {
    setTab(next);
    if (next === TAB_JOBS) setJobsOpened(true);
    if (next === TAB_ITEM) setItemOpened(true);
  };

  const openItem = (item) => {
    setSelectedItem(item);
    setItemOpened(true);
    setTab(TAB_ITEM);
  };

  return (
    <DefaultPageLayout>
      {/* A column, not a wrapping grid: a grid container shares spare height
          across every line, which floats the whole page down. */}
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
        <RecalculationNotice {...range} />

        <Box>
          <Tabs
            value={tab}
            onChange={openTab}
            variant={deviceNotMobile ? "standard" : "fullWidth"}
            sx={{ width: "100%" }}
          >
            <Tab label="Statistics" value={TAB_STATISTICS} />
            <Tab label="Item Statistics" value={TAB_ITEM} />
            <Tab label="Archived Jobs" value={TAB_JOBS} />
          </Tabs>
        </Box>

        {tab === TAB_STATISTICS && (
          <Box
            sx={{
              display: "flex",
              justifyContent: { xs: "stretch", sm: "flex-end" },
            }}
          >
            <ArchiveRangeControl value={rangeKey} onChange={setRangeKey} />
          </Box>
        )}

        <Box sx={{ display: tab === TAB_STATISTICS ? "block" : "none" }}>
          <Grid container spacing={2} sx={{ width: "100%", minWidth: 0 }}>
            <Grid size={12}>
              <ArchivedStatsOverview />
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
              <ArchivedItemBreakdown {...range} onSelectItem={openItem} />
            </Grid>
          </Grid>
        </Box>

        <Box
          sx={{
            // The one child that grows, so its holding state fills the page.
            display: tab === TAB_ITEM ? "flex" : "none",
            flex: 1,
            minHeight: 0,
          }}
        >
          {itemOpened && (
            <ArchivedItemStatistics
              {...range}
              item={selectedItem}
              onSelectItem={setSelectedItem}
              rangeKey={rangeKey}
              onRangeChange={setRangeKey}
            />
          )}
        </Box>

        <Box sx={{ display: tab === TAB_JOBS ? "block" : "none" }}>
          {jobsOpened && <ArchivedJobsList enabled={jobsOpened} />}
        </Box>
      </Box>
    </DefaultPageLayout>
  );
}

export default ArchivedJobsPage;

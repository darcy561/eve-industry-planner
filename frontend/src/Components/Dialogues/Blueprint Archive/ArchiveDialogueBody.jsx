import { Grid, Typography } from "@mui/material";
import ArchiveStatsBreakdown from "./ArchiveStatsBreakdown";
import ArchiveStatsSummary from "./ArchiveStatsSummary";
import { hasMeaningfulTotals } from "./hasMeaningfulTotals";

/**
 * Whether the breakdown describes any activity.
 *
 * A row can carry a `breakdown` object whose segments are all empty — a type the
 * account has a document for but has never built. That should fall through to the
 * same "nothing archived" message as a missing row rather than render three
 * suppressed blocks under a heading.
 *
 * @param {{ combined?: { totalJobs?: number, itemBuildCount?: number, jobCostTotal?: number } }|null|undefined} breakdown
 */
function statsBreakdownHasContent(breakdown) {
  const combined = breakdown?.combined;
  if (!combined) {
    return false;
  }
  return (
    (combined.totalJobs ?? 0) > 0 ||
    (combined.itemBuildCount ?? 0) > 0 ||
    (combined.jobCostTotal ?? 0) > 0
  );
}

/**
 * Blueprint archive dialogue main content (non-loading, non-error states).
 *
 * Prefers the segmented breakdown and falls back to the flat summary, so a row
 * written before the pipeline populated `breakdown` still renders its headline
 * figures instead of an empty dialogue.
 *
 * @param {{
 *   isLoggedIn: boolean,
 *   normalizedId: string|null,
 *   isLoading: boolean,
 *   data: object|null|undefined,
 *   statsBreakdown?: object|null,
 * }} props
 */
export default function ArchiveDialogueBody({
  isLoggedIn,
  normalizedId,
  isLoading,
  data,
  statsBreakdown,
}) {
  if (!isLoggedIn) {
    return (
      <Grid container>
        <Grid size={12} sx={{ textAlign: "center" }}>
          <Typography>
            Sign in to view archived job statistics.
          </Typography>
        </Grid>
      </Grid>
    );
  }

  if (!normalizedId) {
    return (
      <Grid container>
        <Grid size={12} sx={{ textAlign: "center" }}>
          <Typography>No blueprint type selected.</Typography>
        </Grid>
      </Grid>
    );
  }

  if (!isLoading && statsBreakdownHasContent(statsBreakdown)) {
    return (
      <Grid container>
        <Grid size={12}>
          <ArchiveStatsBreakdown breakdown={statsBreakdown} />
        </Grid>
      </Grid>
    );
  }

  if (!isLoading && hasMeaningfulTotals(data)) {
    return <ArchiveStatsSummary data={data} />;
  }

  if (!isLoading) {
    return (
      <Grid container>
        <Grid size={12} sx={{ textAlign: "center" }}>
          <Typography>
            You have no archived jobs matching this item type.
          </Typography>
        </Grid>
      </Grid>
    );
  }

  return null;
}

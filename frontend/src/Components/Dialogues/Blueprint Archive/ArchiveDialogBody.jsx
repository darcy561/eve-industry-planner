import { Grid, Typography } from "@mui/material";
import ArchiveStatsSummary from "./ArchiveStatsSummary";
import { hasMeaningfulBuildStats } from "./hasMeaningfulBuildStats";

/**
 * Blueprint archive dialog main content (non-loading, non-error states).
 */
export default function ArchiveDialogBody({
  isLoggedIn,
  normalizedId,
  isLoading,
  data,
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

  if (!isLoading && hasMeaningfulBuildStats(data)) {
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

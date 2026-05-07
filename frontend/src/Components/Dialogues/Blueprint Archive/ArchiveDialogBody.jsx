import {
  Box,
  Grid,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import ArchiveStatsBreakdown from "./ArchiveStatsBreakdown";
import ArchiveStatsSummary from "./ArchiveStatsSummary";
import { hasMeaningfulBuildStats } from "./hasMeaningfulBuildStats";

/** @param {{ combined?: { totalJobs?: number, itemBuildCount?: number, jobCostTotal?: number } }|null|undefined} breakdown */
function statsBreakdownHasContent(breakdown) {
  if (!breakdown?.combined) {
    return false;
  }
  const c = breakdown.combined;
  return (
    (c.totalJobs ?? 0) > 0 ||
    (c.itemBuildCount ?? 0) > 0 ||
    (c.jobCostTotal ?? 0) > 0
  );
}
import CorporationSelect from "../../../Styled Components/Select/corporations";

/**
 * Blueprint archive dialog main content (non-loading, non-error states).
 */
export default function ArchiveDialogBody({
  isLoggedIn,
  normalizedId,
  isLoading,
  data,
  statsBreakdown,
  statsScope,
  onStatsScopeChange,
  selectedCorpId,
  onSelectedCorpIdChange,
  hasCorporations,
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

  const toolbar = (
    <Stack
      direction={{ xs: "column", sm: "row" }}
      spacing={2}
      sx={{ width: "100%", mb: 2 }}
      alignItems={{ xs: "stretch", sm: "flex-start" }}
    >
      <ToggleButtonGroup
        exclusive
        size="small"
        color="primary"
        value={statsScope}
        onChange={(_, next) => {
          if (next != null) {
            onStatsScopeChange(next);
          }
        }}
        aria-label="Archived statistics scope"
      >
        <ToggleButton value="personal">Personal</ToggleButton>
        <ToggleButton value="corp" disabled={!hasCorporations}>
          Corporation
        </ToggleButton>
      </ToggleButtonGroup>
      {statsScope === "corp" && hasCorporations ? (
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <CorporationSelect
            value={selectedCorpId}
            onChange={onSelectedCorpIdChange}
            formHelperText="Corporation"
          />
        </Box>
      ) : null}
    </Stack>
  );

  const emptyCorpHint =
    statsScope === "corp" && !hasCorporations ? (
      <Typography sx={{ mb: 2 }} color="text.secondary">
        No corporations are linked to your account for corporation archived
        statistics.
      </Typography>
    ) : null;

  if (!isLoading && statsScope === "corp" && !hasCorporations) {
    return (
      <Grid container>
        <Grid size={12}>
          {toolbar}
          {emptyCorpHint}
        </Grid>
      </Grid>
    );
  }

  if (!isLoading && statsBreakdownHasContent(statsBreakdown)) {
    return (
      <Grid container>
        <Grid size={12}>{toolbar}</Grid>
        <Grid size={12}>
          <ArchiveStatsBreakdown breakdown={statsBreakdown} />
        </Grid>
      </Grid>
    );
  }

  if (!isLoading && hasMeaningfulBuildStats(data)) {
    return (
      <Grid container>
        <Grid size={12}>{toolbar}</Grid>
        <Grid size={12}>
          <ArchiveStatsSummary data={data} />
        </Grid>
      </Grid>
    );
  }

  if (!isLoading) {
    return (
      <Grid container>
        <Grid size={12}>{toolbar}</Grid>
        <Grid size={12} sx={{ textAlign: "center" }}>
          <Typography>
            You have no archived jobs matching this item type
            {statsScope === "corp" ? " for this corporation" : ""}.
          </Typography>
        </Grid>
      </Grid>
    );
  }

  return null;
}

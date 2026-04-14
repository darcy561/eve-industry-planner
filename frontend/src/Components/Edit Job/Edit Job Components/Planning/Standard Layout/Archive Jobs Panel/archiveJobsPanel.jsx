import { forwardRef } from "react";
import { Icon, Typography, Tooltip, Grid } from "@mui/material";
import ContentPanel from "../../../../../../Styled Components/Paper/ContentPanel";
import DoneIcon from "@mui/icons-material/Done";
import CloseIcon from "@mui/icons-material/Close";
import {
  jobTypes,
  STANDARD_TEXT_FORMAT,
} from "../../../../../../Context/defaultValues";
import useUsersStore from "../../../../../../Zustand/usersStore";
import { formatNumberForLocale } from "../../../../../../Functions/Helper/numberParser";
import { useBuildStatsQuery } from "../../../../../../Hooks/React Query/Backend/buildStats";

const cellTextSx = { typography: STANDARD_TEXT_FORMAT };

const CellText = forwardRef(function CellText({ children, ...props }, ref) {
  return (
    <Typography ref={ref} align="center" sx={cellTextSx} {...props}>
      {children}
    </Typography>
  );
});

function HeaderCell({ size, sx, tooltip, children }) {
  const label = <CellText>{children}</CellText>;
  return (
    <Grid size={size} sx={sx}>
      {tooltip ? (
        <Tooltip title={tooltip} arrow placement="top">
          {label}
        </Tooltip>
      ) : (
        label
      )}
    </Grid>
  );
}

function ArchiveTableHeader({ isReaction, producedSm }) {
  return (
    <Grid container size={12}>
      <HeaderCell
        size={{ xs: 0, sm: producedSm }}
        sx={{ display: { xs: "none", sm: "block" } }}
      >
        Total Items Produced
      </HeaderCell>
      <HeaderCell size={{ xs: 4, sm: 3 }}>Total Job Cost</HeaderCell>
      <HeaderCell size={{ xs: 4, sm: 2 }}>Job Cost Per Item</HeaderCell>
      <HeaderCell
        size={{ xs: isReaction ? 4 : 0, sm: producedSm }}
        sx={{
          display: { xs: isReaction ? "block" : "none", sm: "block" },
        }}
        tooltip="Jobs without any sales data will always display 0"
      >
        Profit/Loss
      </HeaderCell>
      <HeaderCell
        size={{ xs: 0, sm: 1 }}
        sx={{ display: { xs: "none", sm: "block" } }}
        tooltip="Whether this job was a child job used to build a parent."
      >
        Child Job
      </HeaderCell>
    </Grid>
  );
}

function ArchiveSnapshotRow({ entry, isReaction, producedSm }) {
  return (
    <Grid container size={12}>
      <Grid
        size={{ xs: 0, sm: producedSm }}
        sx={{ display: { xs: "none", sm: "block" } }}
      >
        <CellText>
          {formatNumberForLocale(entry.totalProduced, { max: 0 })}
        </CellText>
      </Grid>
      <Grid size={{ xs: 4, sm: 3 }}>
        <CellText>{formatNumberForLocale(entry.totalJobCost)}</CellText>
      </Grid>
      <Grid size={{ xs: 4, sm: 2 }}>
        <CellText>{formatNumberForLocale(entry.totalCostPerItem)}</CellText>
      </Grid>
      <Grid
        size={{ xs: isReaction ? 4 : 0, sm: producedSm }}
        sx={{
          display: { xs: isReaction ? "block" : "none", sm: "block" },
        }}
      >
        <CellText>{formatNumberForLocale(entry.profitLoss)}</CellText>
      </Grid>
      <Grid
        align="center"
        size={{ xs: 0, sm: 1 }}
        sx={{ display: { xs: "none", sm: "block" } }}
      >
        {entry.childJob ? (
          <Icon fontSize="small" color="success">
            <DoneIcon />
          </Icon>
        ) : (
          <Icon fontSize="small" color="error">
            <CloseIcon />
          </Icon>
        )}
      </Grid>
    </Grid>
  );
}

export default function ArchiveJobsPanel({ state }) {
  const isLoggedIn = useUsersStore((s) => s.account.isLoggedIn);
  const isReaction = state.activeJob.jobType === jobTypes.reaction;
  const producedSm = isReaction ? 3 : 2;

  const {
    data: archiveData,
    isLoading,
    isError,
    error,
  } = useBuildStatsQuery(state.activeJob?.itemID);

  const snapshots = archiveData?.dataSnapshots ?? [];

  return (
    <ContentPanel
      visible={isLoggedIn}
      title="Archived Job Data"
      paperSx={{ height: "auto" }}
      componentName="Archive Jobs Panel"
      isLoading={isLoading}
      isError={isError}
      error={error}
      loadingMessage="Loading archived data…"
    >
      <Grid container spacing={2} width="100%">
        <ArchiveTableHeader isReaction={isReaction} producedSm={producedSm} />
        <Grid container size={12}>
          {snapshots.length > 0 ? (
            snapshots.map((entry) => (
              <ArchiveSnapshotRow
                key={entry.jobID}
                entry={entry}
                isReaction={isReaction}
                producedSm={producedSm}
              />
            ))
          ) : (
            <Grid size={12}>
              <Typography sx={cellTextSx} align="center">
                No Archived Job Data To Display
              </Typography>
            </Grid>
          )}
        </Grid>
      </Grid>
    </ContentPanel>
  );
}

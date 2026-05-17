import { Avatar, IconButton, Typography, Grid } from "@mui/material";

import AddIcon from "@mui/icons-material/Add";
import { showSnackbarSuccess } from "../../../../../../Events/snackbarEvents";
import { LockGatedTooltip } from "../../../../../DocumentLock/LockGatedTooltip";

export function AvailableChildJobs_Purchasing(props) {
  const { availableChildJobs } = props;
  if (availableChildJobs.length === 0) {
    return (
      <Grid size={12}>
        <Typography variant="body1" align="center">
          None Available
        </Typography>
      </Grid>
    );
  }

  return (
    <Grid container sx={{ marginBottom: "40px" }}>
      {availableChildJobs.map((job) => {
        return <AvailableJobEntry key={job.jobID} {...props} job={job} />;
      })}
    </Grid>
  );
}

function AvailableJobEntry({ job, actions, siblingLinkLock }) {
  const { readOnly = false, reason = "" } = siblingLinkLock ?? {};
  const linkButton = (
    <IconButton
      size="small"
      color="primary"
      disabled={readOnly}
      onClick={() => {
        actions.markChildJobsForAddition(job);
        showSnackbarSuccess(`${job.name} Linked`);
      }}
    >
      <AddIcon />
    </IconButton>
  );

  return (
    <Grid
      container
      key={job.jobID}
      size={12}
      sx={{
        justifyContent: "center",
        alignItems: "center"
      }}>
      <Grid
        sx={{
          display: { xs: "none", sm: "block" },
        }}
        align="center"
        size={{
          sm: 1
        }}>
        <Avatar
          src={`https://image.eveonline.com/Type/${job.itemID}_32.png`}
          alt={job.name}
          variant="square"
          sx={{ height: 32, width: 32 }}
        />
      </Grid>
      <Grid sx={{ paddingLeft: "10px" }} size={6}>
        <Typography variant="body1">{job.name}</Typography>
      </Grid>
      <Grid size={4}>
        <Typography variant="body2">
          Setups: {job.totalSetupCount ? job.totalSetupCount : 0}
        </Typography>
      </Grid>
      <Grid size={1}>
        <LockGatedTooltip readOnly={readOnly} reason={reason}>
          {linkButton}
        </LockGatedTooltip>
      </Grid>
    </Grid>
  );
}

import { Avatar, IconButton, Typography, Grid } from "@mui/material";

import AddIcon from "@mui/icons-material/Add";
import { showSnackbarSuccess } from "../../../../../../Events/snackbarEvents";

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

function AvailableJobEntry({ job, actions }) {
  return (
    <Grid
      container
      key={job.jobID}
      justifyContent="center"
      alignItems="center"
      size={12}>
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
        <IconButton
          size="small"
          color="primary"
          onClick={() => {
            actions.markChildJobsForAddition(job);
            showSnackbarSuccess(`${job.name} Linked`);
          }}
        >
          <AddIcon />
        </IconButton>
      </Grid>
    </Grid>
  );
}

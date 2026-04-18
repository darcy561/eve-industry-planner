import { Avatar, IconButton, Typography, Grid } from "@mui/material";

import useUsersStore from "../../../../../../Zustand/usersStore";
import ClearIcon from "@mui/icons-material/Clear";
import { showSnackbarSuccess } from "../../../../../../Events/snackbarEvents";

export function ExistingChildJobs_Purchasing(props) {
  const { existingChildJobs } = props;
  if (existingChildJobs.length === 0) {
    return (
      <Grid size={12}>
        <Typography variant="body1" align="center">
          None Linked
        </Typography>
      </Grid>
    );
  }

  return (
    <Grid container>
      {existingChildJobs.map((childJobID) => {
        return (
          <ChildJobEntry {...props} key={childJobID} childJobID={childJobID} />
        );
      })}
    </Grid>
  );
}

function ChildJobEntry({ actions, childJobID }) {
  const { findJobInJobArray } = useUsersStore.getState().jobData.actions;

  const job = findJobInJobArray(childJobID);

  if (!job) return null;
  const setupCount = Object.values(job.build.setup).reduce((prev, setup) => {
    return prev + 1;
  }, 0);
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
        <Typography variant="body2">Setups: {setupCount}</Typography>
      </Grid>
      <Grid size={1}>
        <IconButton
          size="small"
          color="error"
          onClick={() => {
            actions.markChildJobsForRemoval(job);
            showSnackbarSuccess(`${job.name} Unlinked`);
          }}
        >
          <ClearIcon />
        </IconButton>
      </Grid>
    </Grid>
  );
}

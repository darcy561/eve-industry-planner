import { useEffect, useState } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import useUsersStore from "../../Zustand/usersStore";
import { showSnackbarSuccess } from "../../Events/snackbarEvents";

export function ParentJobDialog({
  state,
  actions,
  dialogTrigger,
  updateDialogTrigger,
}) {
  const { userJobSnapshot, jobArray } = useUsersStore((state) => state.jobData);
  const [matches, updateMatches] = useState([]);

  const handleClose = () => {
    updateDialogTrigger(false);
  };

  useEffect(() => {
    if (!dialogTrigger) {
      return;
    }
    let newMatches = [];
    if (!state.activeJob.includedInGroup) {
      newMatches = userJobSnapshot.filter(
        (job) =>
          (job.materialIDs.has(state.activeJob.itemID) &&
            !state.activeJob.parentJobs.includes(job.jobID) &&
            !state.parentChildToEdit.parentJobs.add.includes(job.jobID)) ||
          state.parentChildToEdit.parentJobs.remove.includes(job.jobID)
      );
    } else {
      newMatches = jobArray.filter(
        (job) =>
          (state.activeJob.includedInGroup && job.groupID === state.activeJob.groupID &&
            !state.activeJob.parentJobs.includes(job.jobID) &&
            job.build.materials.some(
              (material) => material.typeID === state.activeJob.itemID
            ) &&
            !state.parentChildToEdit.parentJobs.add.includes(job.jobID)) ||
          state.parentChildToEdit.parentJobs.remove.includes(job.jobID)
      );
    }
    updateMatches(newMatches);
  }, [dialogTrigger]);

  return (
    <Dialog
      open={dialogTrigger}
      onClose={handleClose}
      sx={{ padding: "20px", width: "100%" }}
    >
      <DialogTitle
        id="ParentJobDialog"
        align="center"
        sx={{ marginBottom: "10px" }}
        color="primary"
      >
        Link Parent Job
      </DialogTitle>
      <DialogContent>
        <Grid container>
          {matches.length > 0 ? (
            matches.map((job) => {
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
                    <img
                      src={`https://images.evetech.net/types/${job.itemID}/icon?size=32`}
                      alt=""
                    />
                  </Grid>
                  <Grid align="center" sx={{ paddingLeft: "10px" }} size={6}>
                    <Typography variant="body1">{job.name}</Typography>
                  </Grid>
                  <Grid align="center" size={4}>
                    <Typography variant="body2">
                      Runs {job.runCount} Jobs {job.jobCount}
                    </Typography>
                  </Grid>
                  <Grid size={1}>
                    <IconButton
                      size="small"
                      color="primary"
                      onClick={() => {
                        actions.markParentJobForAddition(job.jobID);
                        showSnackbarSuccess(`${job.name} Linked`);
                        handleClose();
                      }}
                    >
                      <AddIcon />
                    </IconButton>
                  </Grid>
                </Grid>
              );
            })
          ) : (
            <Grid size={12}>
              No Jobs Available
            </Grid>
          )}
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

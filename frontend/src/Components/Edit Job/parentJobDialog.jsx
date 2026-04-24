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
  const { jobArray } = useUsersStore((state) => state.jobData);
  const [matches, updateMatches] = useState([]);

  const handleClose = () => {
    updateDialogTrigger(false);
  };

  useEffect(() => {
    if (!dialogTrigger) {
      return;
    }
    const active = state.activeJob;
    const itemID = active.itemID;

    const usesActiveOutputAsMaterial = (job) =>
      job.build?.materials?.some((m) => m.typeID === itemID) ?? false;

    const newMatches = jobArray.filter((job) => {
      if (state.parentChildToEdit.parentJobs.remove.includes(job.jobID)) {
        return true;
      }
      if (!usesActiveOutputAsMaterial(job)) {
        return false;
      }
      if (active.parentJobs.includes(job.jobID)) {
        return false;
      }
      if (state.parentChildToEdit.parentJobs.add.includes(job.jobID)) {
        return false;
      }
      if (active.includedInGroup && job.groupID !== active.groupID) {
        return false;
      }
      return true;
    });

    updateMatches(newMatches);
  }, [
    dialogTrigger,
    jobArray,
    state.activeJob,
    state.parentChildToEdit.parentJobs,
  ]);

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
                      {job.setupCount()} setup
                      {job.setupCount() === 1 ? "" : "s"} ·{" "}
                      {job.build?.products?.totalQuantity ?? 0} items produced
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

import { useEffect, useState } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  Tooltip,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import useUsersStore from "../../Zustand/usersStore";
import { showSnackbarSuccess } from "../../Events/snackbarEvents";
import { useActiveJobReadOnly } from "./Edit Job Hooks/useActiveJobDocumentLock";
import { lockReasonText } from "../DocumentLock/LockGatedTooltip";

export function ParentJobDialogue({
  state,
  actions,
  dialogueTrigger,
  updateDialogueTrigger,
}) {
  const { jobArray } = useUsersStore((rootState) => rootState.jobData);
  const [matches, updateMatches] = useState([]);
  const jobLockReadOnly = useActiveJobReadOnly(state);

  const handleClose = () => {
    updateDialogueTrigger(false);
  };

  useEffect(() => {
    if (!dialogueTrigger) {
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
    dialogueTrigger,
    jobArray,
    state.activeJob,
    state.parentChildToEdit.parentJobs,
  ]);

  return (
    <Dialog
      open={dialogueTrigger}
      onClose={handleClose}
      sx={{ padding: "20px", width: "100%" }}
    >
      <DialogTitle
        id="ParentJobDialogue"
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
                      {job.totalQuantityProduced()} items produced
                    </Typography>
                  </Grid>
                  <Grid size={1}>
                    <Tooltip
                      title={
                        jobLockReadOnly
                          ? lockReasonText({ action: "linking is disabled" })
                          : ""
                      }
                      arrow
                      disableHoverListener={!jobLockReadOnly}
                    >
                      <span>
                        <IconButton
                          size="small"
                          color="primary"
                          disabled={jobLockReadOnly}
                          onClick={() => {
                            actions.markParentJobForAddition(job.jobID);
                            showSnackbarSuccess(`${job.name} Linked`);
                            handleClose();
                          }}
                        >
                          <AddIcon />
                        </IconButton>
                      </span>
                    </Tooltip>
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

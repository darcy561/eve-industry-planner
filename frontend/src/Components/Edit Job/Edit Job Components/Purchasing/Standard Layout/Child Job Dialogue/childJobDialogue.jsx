import { useMemo } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  Typography,
} from "@mui/material";
import { AvailableChildJobs_Purchasing } from "./availableChildJobs";
import { ExistingChildJobs_Purchasing } from "./existingChildJobs";
import getCurrentLinkedChildJobIDsForMaterial from "../Material Cards/functions/getCurrentLinkedChildJobIDsForMaterial.js";
import useUsersStore from "../../../../../../Zustand/usersStore";

export function ChildJobDialogue(props) {
  const { state, material, childDialogTrigger, updateChildDialogTrigger } =
    props;
  const { userJobSnapshot, jobArray } = useUsersStore((state) => state.jobData);


  const existingChildJobs = getCurrentLinkedChildJobIDsForMaterial(
    material.typeID,
    state.activeJob,
    state.temporaryChildJobs,
    state.parentChildToEdit
  );

  function handleClose() {
    updateChildDialogTrigger(false);
  }

  const availableChildJobs = useMemo(() => {
    const jobs = !state.activeJob.groupID ? userJobSnapshot : jobArray;
    const filteredJobs = jobs.filter(
      (job) =>
        job.itemID === material.typeID &&
        !existingChildJobs.includes(job.jobID) &&
        (state.activeJob.groupID === null ||
          job.groupID === state.activeJob.groupID)
    );
    return filteredJobs;
  }, [state.activeJob, userJobSnapshot, jobArray, material]);

  return (
    <Dialog
      open={childDialogTrigger}
      onClose={handleClose}
      sx={{ padding: "20px", width: "100%" }}
    >
      <DialogTitle id="ParentJobDialog" align="center" color="primary">
        Available Child Jobs
      </DialogTitle>
      <DialogContent>
        <AvailableChildJobs_Purchasing
          {...props}
          availableChildJobs={availableChildJobs}
        />
        <Grid sx={{ marginBottom: "10px" }}>
          <Typography variant="h6" color="primary" align="center">
            Linked Child Jobs
          </Typography>
        </Grid>
        <ExistingChildJobs_Purchasing
          {...props}
          existingChildJobs={existingChildJobs}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

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
import { useSiblingLinkLock } from "../../../../Edit Job Hooks/useActiveJobDocumentLock";

export function ChildJobDialogue(props) {
  const { state, material, childDialogueTrigger, updateChildDialogueTrigger } =
    props;
  const { jobArray } = useUsersStore((rootState) => rootState.jobData);
  /**
   * Computed once at the dialogue level and broadcast through `{...props}` so the
   * Add/Clear row buttons share the same reactive lock subscription instead of
   * each row re-running the selector chain.
   */
  const siblingLinkLock = useSiblingLinkLock(state);

  const existingChildJobs = getCurrentLinkedChildJobIDsForMaterial(
    material.typeID,
    state.activeJob,
    state.temporaryChildJobs,
    state.parentChildToEdit
  );

  function handleClose() {
    updateChildDialogueTrigger(false);
  }

  const availableChildJobs = useMemo(() => {
    const filteredJobs = jobArray.filter(
      (job) =>
        job.itemID === material.typeID &&
        !existingChildJobs.includes(job.jobID) &&
        (!state.activeJob.includedInGroup ||
          job.groupID === state.activeJob.groupID)
    );
    return filteredJobs;
  }, [state.activeJob, jobArray, material]);

  return (
    <Dialog
      open={childDialogueTrigger}
      onClose={handleClose}
      sx={{ padding: "20px", width: "100%" }}
    >
      <DialogTitle id="ParentJobDialogue" align="center" color="primary">
        Available Child Jobs
      </DialogTitle>
      <DialogContent>
        <AvailableChildJobs_Purchasing
          {...props}
          availableChildJobs={availableChildJobs}
          siblingLinkLock={siblingLinkLock}
        />
        <Grid sx={{ marginBottom: "10px" }}>
          <Typography variant="h6" color="primary" align="center">
            Linked Child Jobs
          </Typography>
        </Grid>
        <ExistingChildJobs_Purchasing
          {...props}
          existingChildJobs={existingChildJobs}
          siblingLinkLock={siblingLinkLock}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

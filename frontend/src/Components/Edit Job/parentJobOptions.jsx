import { useMemo } from "react";
import { Grid, IconButton, Tooltip, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import useUsersStore from "../../Zustand/usersStore";
import { showSnackbarSuccess } from "../../Events/snackbarEvents";
import { useActiveJobReadOnly } from "./Edit Job Hooks/useActiveJobDocumentLock";
import { lockReasonText } from "../DocumentLock/LockGatedTooltip";
import { TYPE_IMAGE, typeImageUrl } from "../../Functions/Shared/eveImage";

/**
 * The jobs the job being edited can be linked to as a parent, as the body of a
 * dialogue. Mounted only while that dialogue is open, so the pass over the
 * planner's jobs costs nothing while nobody is looking at it.
 *
 * @param {Object} props
 * @param {Object} props.state - Edit Job reducer state
 * @param {Object} props.actions - Edit Job reducer actions
 * @param {Function} props.onLinked - Called once a parent has been chosen
 */
export function ParentJobOptions({ state, actions, onLinked }) {
  const { jobArray } = useUsersStore((rootState) => rootState.jobData);
  const jobLockReadOnly = useActiveJobReadOnly(state);

  const matches = useMemo(() => {
    const active = state.activeJob;
    const itemID = active.itemID;

    const usesActiveOutputAsMaterial = (job) =>
      job.build?.materials?.some((m) => m.typeID === itemID) ?? false;

    return jobArray.filter((job) => {
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
  }, [jobArray, state.activeJob, state.parentChildToEdit.parentJobs]);

  return (
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
                alignItems: "center",
              }}
            >
              <Grid
                sx={{
                  display: { xs: "none", sm: "block" },
                }}
                align="center"
                size={{
                  sm: 1,
                }}
              >
                <img
                  src={typeImageUrl(job.itemID, TYPE_IMAGE.ICON, 32)}
                  alt=""
                />
              </Grid>
              <Grid align="center" sx={{ paddingLeft: "10px" }} size={6}>
                <Typography variant="body1">{job.name}</Typography>
              </Grid>
              <Grid align="center" size={4}>
                <Typography variant="body2">
                  {job.setupCount} setup
                  {job.setupCount === 1 ? "" : "s"} ·{" "}
                  {job.totalQuantityProduced} items produced
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
                        onLinked();
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
        <Grid size={12}>No Jobs Available</Grid>
      )}
    </Grid>
  );
}

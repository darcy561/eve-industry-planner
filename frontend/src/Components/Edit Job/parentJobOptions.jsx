import {
  setupCount,
  totalQuantityProduced,
} from "./Edit Job Hooks/jobSelectors";
import { useMemo } from "react";
import { Grid, IconButton, Tooltip, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import useUsersStore from "../../Zustand/usersStore";
import { showSnackbarSuccess } from "../../Events/snackbarEvents";
import { useActiveJobReadOnly } from "./Edit Job Hooks/useActiveJobDocumentLock";
import { lockReasonText } from "../DocumentLock/LockGatedTooltip";
import { TYPE_IMAGE, typeImageUrl } from "../../Functions/Shared/eveImage";
import {
  useJobActions,
  useJobDraft,
  useParentLinkIntents,
} from "./Edit Job Hooks/useJobDraft";

/**
 * The jobs the job being edited can be linked to as a parent, as the body of a
 * dialogue. Mounted only while that dialogue is open, so the pass over the
 * planner's jobs costs nothing while nobody is looking at it.
 *
 * @param {Object} props
 * @param {Function} props.onLinked - Called once a parent has been chosen
 */
export function ParentJobOptions({ onLinked }) {
  const { jobArray } = useUsersStore((rootState) => rootState.jobData);
  const linkEdits = useParentLinkIntents();
  const itemID = useJobDraft((job) => job.itemID);
  const parentJobs = useJobDraft((job) => job.parentJobs);
  const includedInGroup = useJobDraft((job) => job.includedInGroup);
  const groupID = useJobDraft((job) => job.groupID);
  const actions = useJobActions();
  const jobLockReadOnly = useActiveJobReadOnly();

  const matches = useMemo(() => {
    const usesActiveOutputAsMaterial = (job) =>
      job.build?.materials?.[String(itemID)] !== undefined;

    return jobArray.filter((job) => {
      if (linkEdits.remove.includes(job.jobID)) {
        return true;
      }
      if (!usesActiveOutputAsMaterial(job)) {
        return false;
      }
      if (parentJobs.includes(job.jobID)) {
        return false;
      }
      if (linkEdits.add.includes(job.jobID)) {
        return false;
      }
      if (includedInGroup && job.groupID !== groupID) {
        return false;
      }
      return true;
    });
  }, [jobArray, linkEdits, itemID, parentJobs, includedInGroup, groupID]);

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
                  {setupCount(job)} setup
                  {setupCount(job) === 1 ? "" : "s"} ·{" "}
                  {totalQuantityProduced(job)} items produced
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

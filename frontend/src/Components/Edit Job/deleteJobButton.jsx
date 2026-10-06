import { Button, Tooltip } from "@mui/material";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";

import deleteJobsFromPlanner from "../../Functions/Job/changes/deleteMultipleJobs";
import { routeBackFromEditJob } from "../../Functions/Groups/groupPageViewSearch";
import { yieldEditJobDocumentLocksOnLeave } from "../../Functions/DocumentLock/yieldEditJobDocumentLocksOnLeave.js";
import { useActiveJobPersistGate } from "./Edit Job Hooks/useActiveJobDocumentLock";
import { persistAffordanceBlockedReason } from "../DocumentLock/LockGatedTooltip";
import { useJobDraft } from "./Edit Job Hooks/useJobDraft";
import { useDialogueTrigger } from "../../Styled Components/Dialogue/ContentDialogue";
import DeleteJobConfirmDialogue from "./DeleteJobConfirmDialogue";

/** Deletes the open job from the planner once the reader confirms it, then leaves the page. */
export function DeleteJobButton() {
  const navigate = useNavigate({ from: "/editjob/$jobID" });
  const search = useSearch({ from: "/editjob/$jobID" });
  const { jobID } = useParams({ from: "/editjob/$jobID" });
  const persist = useActiveJobPersistGate();
  const openJobID = useJobDraft((job) => job.jobID);
  const confirm = useDialogueTrigger();

  const deleteBlockedReason = persistAffordanceBlockedReason({
    readOnly: persist.readOnly,
    jobLockHeld: persist.jobLockHeld,
    action: "delete is disabled",
  });

  async function deleteAndLeave() {
    if (!persist.canPersist || !(await deleteJobsFromPlanner(openJobID))) {
      confirm.close();
      return;
    }
    await yieldEditJobDocumentLocksOnLeave({ jobID });
    return navigate(routeBackFromEditJob(search, openJobID));
  }

  return (
    <>
      <Tooltip title={deleteBlockedReason} arrow placement="bottom">
        <span>
          <Button
            size="small"
            variant="outlined"
            color="error"
            disabled={!persist.canPersist}
            onClick={confirm.open}
          >
            Delete
          </Button>
        </span>
      </Tooltip>
      <DeleteJobConfirmDialogue
        {...confirm.dialogueProps}
        onDelete={deleteAndLeave}
      />
    </>
  );
}

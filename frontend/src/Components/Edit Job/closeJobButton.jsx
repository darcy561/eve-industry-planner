import { useTransition } from "react";
import { Button } from "@mui/material";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { routeBackFromEditJob } from "../../Functions/Groups/groupPageViewSearch";
import { yieldEditJobDocumentLocksOnLeave } from "../../Functions/DocumentLock/yieldEditJobDocumentLocksOnLeave.js";
import { leaveEditedJobWhereItStands } from "../../Functions/Job/editing/editSessionLifetime.js";
import { useDialogueTrigger } from "../../Styled Components/Dialogue/ContentDialogue";
import EditJobLeaveConfirmDialogue from "./EditJobLeaveConfirmDialogue";
import { useActiveJobPersistGate } from "./Edit Job Hooks/useActiveJobDocumentLock";
import { useSaveAndLeave } from "./Edit Job Hooks/saveOpenJob";
import { useJobDraft, useJobModified } from "./Edit Job Hooks/useJobDraft";

/**
 * Leaves the job as the session holds it under the reader's edits, asking first when there are any.
 */
export function CloseJobButton() {
  const navigate = useNavigate({ from: "/editjob/$jobID" });
  const search = useSearch({ from: "/editjob/$jobID" });
  const { jobID } = useParams({ from: "/editjob/$jobID" });
  const name = useJobDraft((job) => job.name);
  const modified = useJobModified();
  const persist = useActiveJobPersistGate();
  const saveAndLeave = useSaveAndLeave();
  const confirm = useDialogueTrigger();
  const [isLeaving, startLeaving] = useTransition();

  async function closeWithoutSaving() {
    await yieldEditJobDocumentLocksOnLeave({ jobID });
    leaveEditedJobWhereItStands();
    return navigate(routeBackFromEditJob(search, jobID));
  }

  return (
    <>
      <Button
        size="small"
        variant="outlined"
        disabled={isLeaving}
        onClick={
          modified ? confirm.open : () => startLeaving(closeWithoutSaving)
        }
      >
        Close
      </Button>
      <EditJobLeaveConfirmDialogue
        {...confirm.dialogueProps}
        mode="close"
        currentJobName={name}
        nextJobName={null}
        leaveSaving={isLeaving}
        saveDisabled={!persist.canPersist}
        onDiscard={() => startLeaving(closeWithoutSaving)}
        onSave={() =>
          startLeaving(async () => {
            if ((await saveAndLeave()) === "kept-open") confirm.close();
          })
        }
      />
    </>
  );
}

import { IconButton, Tooltip } from "@mui/material";
import SaveIcon from "@mui/icons-material/Save";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { saveOpenJob } from "./Edit Job Hooks/saveOpenJob";
import { buildGroupSearchAfterEditClose } from "../../Functions/Groups/groupPageViewSearch";
import { yieldEditJobDocumentLocksOnLeave } from "../../Functions/DocumentLock/yieldEditJobDocumentLocksOnLeave.js";
import { useActiveJobPersistGate } from "./Edit Job Hooks/useActiveJobDocumentLock";
import { persistAffordanceBlockedReason } from "../DocumentLock/LockGatedTooltip";
import { useJobDraft } from "./Edit Job Hooks/useJobDraft";

export function SaveJobIcon() {
  const queryClient = useQueryClient();
  const navigate = useNavigate({ from: "/editjob/$jobID" });
  const search = useSearch({ from: "/editjob/$jobID" });
  const { jobID } = useParams({ from: "/editjob/$jobID" });
  const persist = useActiveJobPersistGate();
  const openJobID = useJobDraft((job) => job.jobID);

  async function onClick() {
    if (!persist.canPersist) return;
    await saveOpenJob(queryClient);
    const groupIDFromParams = search.activeGroup;
    await yieldEditJobDocumentLocksOnLeave({
      jobID,
      groupID: groupIDFromParams,
    });

    if (groupIDFromParams) {
      navigate({
        to: "/group/$groupID",
        params: { groupID: groupIDFromParams },
        search: buildGroupSearchAfterEditClose(search, openJobID),
      });
    } else {
      navigate({ to: "/jobplanner" });
    }
  }
  const saveBlockedReason = persistAffordanceBlockedReason({
    readOnly: persist.readOnly,
    jobReadOnly: persist.jobReadOnly,
    groupReadOnly: persist.groupReadOnly,
    jobLockHeld: persist.jobLockHeld,
    groupLockHeld: persist.groupLockHeld,
    hasGroup: persist.hasGroup,
    action: "save is disabled",
  });

  return (
    <Tooltip
      title={
        saveBlockedReason ||
        "Saves all changes and returns to the job planner page."
      }
      arrow
      placement="bottom"
    >
      <span>
        <IconButton
          color="primary"
          size="medium"
          onClick={onClick}
          disabled={!persist.canPersist}
          aria-label="Save and return to the job planner"
        >
          <SaveIcon />
        </IconButton>
      </span>
    </Tooltip>
  );
}

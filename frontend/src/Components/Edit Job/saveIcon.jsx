import { IconButton, Tooltip } from "@mui/material";
import SaveIcon from "@mui/icons-material/Save";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import closeActiveJob from "../../Functions/JobPlanner/closeActiveJob";
import { buildGroupSearchAfterEditClose } from "../../Functions/Groups/groupPageViewSearch";
import { useActiveJobPersistGate } from "./Edit Job Hooks/useActiveJobDocumentLock";
import { persistAffordanceBlockedReason } from "../DocumentLock/LockGatedTooltip";

export function SaveJobIcon({ state }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate({ from: '/editjob/$jobID' });
  const search = useSearch({ from: '/editjob/$jobID' });
  const persist = useActiveJobPersistGate(state);

  async function onClick() {
    if (!persist.canPersist) return;
    await closeActiveJob(
      state.activeJob,
      state.jobModified,
      state.temporaryChildJobs,
      state.esiDataToLink,
      state.parentChildToEdit,
      queryClient
    );
    const groupIDFromParams = search.activeGroup;
    
    if (groupIDFromParams) {
      navigate({
        to: "/group/$groupID",
        params: { groupID: groupIDFromParams },
        search: buildGroupSearchAfterEditClose(search, state.activeJob?.jobID),
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
        >
          <SaveIcon />
        </IconButton>
      </span>
    </Tooltip>
  );
}

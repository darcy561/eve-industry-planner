import { IconButton, Tooltip } from "@mui/material";
import SaveIcon from "@mui/icons-material/Save";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import closeActiveJob from "../../Functions/JobPlanner/closeActiveJob";
import { buildGroupSearchAfterEditClose } from "../../Functions/Groups/groupPageViewSearch";
import { useActiveJobReadOnly } from "./Edit Job Hooks/useActiveJobDocumentLock";
import { lockReasonText } from "../DocumentLock/LockGatedTooltip";

export function SaveJobIcon({ state }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate({ from: '/editjob/$jobID' });
  const search = useSearch({ from: '/editjob/$jobID' });
  const jobLockReadOnly = useActiveJobReadOnly(state);

  async function onClick() {
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
  return (
    <Tooltip
      title={
        jobLockReadOnly
          ? lockReasonText({ action: "save is disabled" })
          : "Saves all changes and returns to the job planner page."
      }
      arrow
      placement="bottom"
    >
      <span>
        <IconButton
          color="primary"
          size="medium"
          onClick={onClick}
          disabled={jobLockReadOnly}
        >
          <SaveIcon />
        </IconButton>
      </span>
    </Tooltip>
  );
}

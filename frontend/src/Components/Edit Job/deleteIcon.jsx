import { Tooltip, IconButton } from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import { useNavigate, useSearch } from "@tanstack/react-router";

import deleteJobsFromPlanner from "../../Functions/JobPlanner/deleteMultipleJobs";
import { buildGroupSearchAfterEditClose } from "../../Functions/Groups/groupPageViewSearch";
import { useActiveJobPersistGate } from "./Edit Job Hooks/useActiveJobDocumentLock";
import { persistAffordanceBlockedReason } from "../DocumentLock/LockGatedTooltip";

export function DeleteJobIcon({ state }) {
  const navigate = useNavigate({ from: "/editjob/$jobID" });
  const search = useSearch({ from: "/editjob/$jobID" });
  const persist = useActiveJobPersistGate(state);

  const deleteBlockedReason = persistAffordanceBlockedReason({
    readOnly: persist.readOnly,
    jobReadOnly: persist.jobReadOnly,
    groupReadOnly: persist.groupReadOnly,
    jobLockHeld: persist.jobLockHeld,
    groupLockHeld: persist.groupLockHeld,
    hasGroup: persist.hasGroup,
    action: "delete is disabled",
  });

  return (
    <Tooltip
      title={
        deleteBlockedReason || "Deletes the job from the job planner."
      }
      arrow
      placement="bottom"
    >
      <span>
        <IconButton
          variant="contained"
          color="error"
          disabled={!persist.canPersist}
          onClick={async () => {
            if (!persist.canPersist) return;
            await deleteJobsFromPlanner(state.activeJob.jobID);
            const groupIDFromParams = search.activeGroup;
            if (groupIDFromParams) {
              navigate({
                to: "/group/$groupID",
                params: { groupID: groupIDFromParams },
                search: buildGroupSearchAfterEditClose(
                  search,
                  state.activeJob?.jobID
                ),
              });
            } else {
              navigate({ to: "/jobplanner" });
            }
          }}
          size="medium"
        >
          <DeleteIcon />
        </IconButton>
      </span>
    </Tooltip>
  );
}

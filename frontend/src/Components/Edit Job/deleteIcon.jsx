import { Tooltip, IconButton } from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import { useNavigate, useSearch } from "@tanstack/react-router";

import deleteJobsFromPlanner from "../../Functions/JobPlanner/deleteMultipleJobs";
import { buildGroupSearchAfterEditClose } from "../../Functions/Groups/groupPageViewSearch";
import { useActiveJobReadOnly } from "./Edit Job Hooks/useActiveJobDocumentLock";
import { lockReasonText } from "../DocumentLock/LockGatedTooltip";

export function DeleteJobIcon({ state }) {
  const navigate = useNavigate({ from: "/editjob/$jobID" });
  const search = useSearch({ from: "/editjob/$jobID" });
  const jobLockReadOnly = useActiveJobReadOnly(state);

  return (
    <Tooltip
      title={
        jobLockReadOnly
          ? lockReasonText({ action: "delete is disabled" })
          : "Deletes the job from the job planner."
      }
      arrow
      placement="bottom"
    >
      <span>
        <IconButton
          variant="contained"
          color="error"
          disabled={jobLockReadOnly}
          onClick={async () => {
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

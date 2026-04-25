import { Tooltip, IconButton } from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import { useNavigate, useSearch } from "@tanstack/react-router";

import deleteJobsFromPlanner from "../../Functions/JobPlanner/deleteMultipleJobs";
import { buildGroupSearchAfterEditClose } from "../../Functions/Groups/groupPageViewSearch";

export function DeleteJobIcon({ state }) {
  const navigate = useNavigate({ from: "/editjob/$jobID" });
  const search = useSearch({ from: "/editjob/$jobID" });

  return (
    <Tooltip
      title="Deletes the job from the job planner."
      arrow
      placement="bottom"
    >
      <IconButton
        variant="contained"
        color="error"
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
    </Tooltip>
  );
}

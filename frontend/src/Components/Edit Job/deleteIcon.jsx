import { Tooltip, IconButton } from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import { useNavigate, useSearch } from "@tanstack/react-router";

import deleteJobsFromPlanner from "../../Functions/JobPlanner/deleteMultipleJobs";

export function DeleteJobIcon({ state }) {
  const navigate = useNavigate();
  const search = useSearch({ from: '/editjob/$jobID' });

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
          const returnURL = groupIDFromParams
            ? `/group/${groupIDFromParams}`
            : "/jobplanner";
          navigate({ to: returnURL });
        }}
        size="medium"
      >
        <DeleteIcon />
      </IconButton>
    </Tooltip>
  );
}

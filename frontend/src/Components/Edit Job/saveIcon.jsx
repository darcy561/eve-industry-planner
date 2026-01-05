import { IconButton, Tooltip } from "@mui/material";
import SaveIcon from "@mui/icons-material/Save";
import { useCloseActiveJob } from "../../Hooks/JobHooks/useCloseActiveJob";
import { useNavigate, useSearch } from "@tanstack/react-router";

export function SaveJobIcon({ state }) {
  const { closeActiveJob } = useCloseActiveJob();
  const navigate = useNavigate({ from: '/editjob/$jobID' });
  const search = useSearch({ from: '/editjob/$jobID' });

  async function onClick() {
    await closeActiveJob(
      state.activeJob,
      state.jobModified,
      state.temporaryChildJobs,
      state.esiDataToLink,
      state.parentChildToEdit
    );
    const groupIDFromParams = search.activeGroup;
    
    if (groupIDFromParams) {
      navigate({ 
        to: '/group/$groupID', 
        params: { groupID: groupIDFromParams } 
      });
    } else {
      navigate({ to: "/jobplanner" });
    }
  }
  return (
    <Tooltip
      title="Saves all changes and returns to the job planner page."
      arrow
      placement="bottom"
    >
      <IconButton color="primary" size="medium" onClick={onClick}>
        <SaveIcon />
      </IconButton>
    </Tooltip>
  );
}

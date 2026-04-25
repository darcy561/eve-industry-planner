import { IconButton, Tooltip } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { useNavigate, useSearch } from "@tanstack/react-router";
import useUsersStore from "../../Zustand/usersStore";
import { buildGroupSearchAfterEditClose } from "../../Functions/Groups/groupPageViewSearch";

export function CloseJobIcon({ backupJob }) {
  const { setActiveJobID, updateOrAddJobsToJobArray } = useUsersStore.getState().jobData.actions;
  const navigate = useNavigate({ from: '/editjob/$jobID' });
  const search = useSearch({ from: '/editjob/$jobID' });

  function onClick() {
    const isGroupPage = search.activeGroup !== undefined;
    const groupID = search.activeGroup;
    updateOrAddJobsToJobArray(backupJob);
    setActiveJobID(null);
    
    if (isGroupPage) {
      navigate({
        to: "/group/$groupID",
        params: { groupID },
        search: buildGroupSearchAfterEditClose(search, backupJob?.jobID),
      });
    } else {
      navigate({ to: '/jobplanner' });
    }
  }

  return (
    <Tooltip
      title="Returns to the job planner without saving changes to the job."
      arrow
      placement="bottom"
    >
      <IconButton color="primary" size="medium" onClick={onClick}>
        <CloseIcon />
      </IconButton>
    </Tooltip>
  );
}

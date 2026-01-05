import { IconButton, Tooltip } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { useNavigate, useSearch } from "@tanstack/react-router";
import useUsersStore from "../../Zustand/usersStore";

export function CloseJobIcon({ backupJob }) {
  const { jobArray } = useUsersStore((state) => state.jobData);
  const { setActiveJobID, replaceJobArray } = useUsersStore.getState().jobData.actions;
  const navigate = useNavigate({ from: '/editjob/$jobID' });
  const search = useSearch({ from: '/editjob/$jobID' });

  function onClick() {
    const newJobArray = [
      ...jobArray.filter((i) => i.jobID !== backupJob.jobID),
      backupJob,
    ];
    const isGroupPage = search.activeGroup !== undefined;
    const groupID = search.activeGroup;
    replaceJobArray(newJobArray);
    setActiveJobID(null);
    
    if (isGroupPage) {
      navigate({ 
        to: '/group/$groupID', 
        params: { groupID: groupID } 
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

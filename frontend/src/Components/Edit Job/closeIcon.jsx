import { IconButton, Tooltip } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import useUsersStore from "../../Zustand/usersStore";
import { buildGroupSearchAfterEditClose } from "../../Functions/Groups/groupPageViewSearch";
import { yieldEditJobDocumentLocksOnLeave } from "../../Functions/DocumentLock/yieldEditJobDocumentLocksOnLeave.js";

export function CloseJobIcon({ backupJob }) {
  const { setActiveJobID, updateOrAddJobsToJobArray } = useUsersStore.getState().jobData.actions;
  const navigate = useNavigate({ from: '/editjob/$jobID' });
  const search = useSearch({ from: '/editjob/$jobID' });
  const { jobID } = useParams({ from: "/editjob/$jobID" });

  async function onClick() {
    const groupID = search.activeGroup;
    await yieldEditJobDocumentLocksOnLeave({ jobID, groupID });
    updateOrAddJobsToJobArray(backupJob);
    setActiveJobID(null);

    if (groupID) {
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

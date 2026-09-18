import { IconButton, Tooltip } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import useUsersStore from "../../Zustand/usersStore";
import { buildGroupSearchAfterEditClose } from "../../Functions/Groups/groupPageViewSearch";
import { yieldEditJobDocumentLocksOnLeave } from "../../Functions/DocumentLock/yieldEditJobDocumentLocksOnLeave.js";
import { restoreJobIfStillHeld } from "../../Functions/JobPlanner/restoreJobIfStillHeld.js";

/**
 * Closing restores the job as it was before editing. The backup is taken from
 * the ref when the reader clicks rather than read while rendering: today the
 * hook that writes it sets the active job in the same breath, so a render
 * always follows, but the button should not depend on that remaining true.
 */
export function CloseJobIcon({ backupJobRef }) {
  const { setActiveJobID } = useUsersStore.getState().jobData.actions;
  const navigate = useNavigate({ from: "/editjob/$jobID" });
  const search = useSearch({ from: "/editjob/$jobID" });
  const { jobID } = useParams({ from: "/editjob/$jobID" });

  async function onClick() {
    const groupID = search.activeGroup;
    const backupJob = backupJobRef.current;
    await yieldEditJobDocumentLocksOnLeave({ jobID, groupID });
    restoreJobIfStillHeld(backupJob);
    setActiveJobID(null);

    if (groupID) {
      navigate({
        to: "/group/$groupID",
        params: { groupID },
        search: buildGroupSearchAfterEditClose(search, backupJob?.jobID),
      });
    } else {
      navigate({ to: "/jobplanner" });
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

import { Button } from "@mui/material";
import useUsersStore from "../../../../../../Zustand/usersStore";

export function MarkAsCompleteButton({ state, actions }) {
  const { groupArray } = useUsersStore((state) => state.jobData);
  const { updateModifiedGroups, queueJobGroupWritesAndSchedule } = useUsersStore(
    (state) => state.jobData.actions
  );
  const { activeGroupID } = useUsersStore((state) => state.jobData);

  const activeGroupObject = groupArray.find((i) => i.groupID === activeGroupID);

  function toggleMarkJobAsComplete() {
    if (!activeGroupObject) return;
    if (activeGroupObject.areComplete.has(state.activeJob.jobID)) {
      activeGroupObject.removeAreComplete(state.activeJob.jobID);
    } else {
      activeGroupObject.addAreComplete(state.activeJob.jobID);
    }
    updateModifiedGroups(activeGroupObject);
    if (activeGroupID) {
      queueJobGroupWritesAndSchedule(activeGroupID);
    }

    actions.markJobAsModified();
  }

  if (!activeGroupID) {
    return null;
  }

  return (
    <Button
      color="primary"
      variant="contained"
      size="small"
      onClick={toggleMarkJobAsComplete}
      sx={{ margin: 1 }}
    >
      {activeGroupObject.areComplete.has(state.activeJob.jobID)
        ? "Mark As Incomplete"
        : "Mark As Complete"}
    </Button>
  );
}

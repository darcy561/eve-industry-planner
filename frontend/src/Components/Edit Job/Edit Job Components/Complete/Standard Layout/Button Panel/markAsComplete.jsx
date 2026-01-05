import { Button } from "@mui/material";
import useUsersStore from "../../../../../../Zustand/usersStore";

export function MarkAsCompleteButton({ state, actions }) {
  const { groupArray } = useUsersStore((state) => state.jobData);
  const { replaceGroupArray } = useUsersStore((state) => state.jobData.actions);
  const { activeGroupID } = useUsersStore((state) => state.jobData);

  const activeGroupObject = groupArray.find((i) => i.groupID === activeGroupID);

  function toggleMarkJobAsComplete() {
    const updatedGroupArray = groupArray.map(group => {
      if (group.groupID === activeGroupID) {
        const newGroup = { ...group };

        if (group.areComplete.has(state.activeJob.jobID)) {
          newGroup.removeAreComplete(state.activeJob.jobID);
        } else {
          newGroup.addAreComplete(state.activeJob.jobID);
        }

        return newGroup;
      }
      return group;
    });

    replaceGroupArray(updatedGroupArray);

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

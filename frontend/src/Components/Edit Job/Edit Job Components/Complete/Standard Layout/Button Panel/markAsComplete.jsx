import { Button } from "@mui/material";
import useUsersStore from "../../../../../../Zustand/usersStore";
import { useActiveJobReadOnly } from "../../../../Edit Job Hooks/useActiveJobDocumentLock";
import {
  LockGatedTooltip,
  lockReasonText,
} from "../../../../../DocumentLock/LockGatedTooltip";

export function MarkAsCompleteButton({ state, actions }) {
  const { groupArray } = useUsersStore((state) => state.jobData);
  const { updateModifiedGroups, queueJobGroupWritesAndSchedule } = useUsersStore(
    (state) => state.jobData.actions
  );
  const { activeGroupID } = useUsersStore((state) => state.jobData);
  const jobLockReadOnly = useActiveJobReadOnly(state);

  const activeGroupObject = groupArray.find((i) => i.groupID === activeGroupID);

  function toggleMarkJobAsComplete() {
    if (jobLockReadOnly) return;
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
    <LockGatedTooltip
      readOnly={jobLockReadOnly}
      reason={lockReasonText({ action: "completion state is disabled" })}
    >
      <Button
        color="primary"
        variant="contained"
        size="small"
        onClick={toggleMarkJobAsComplete}
        disabled={jobLockReadOnly}
        sx={{ margin: 1 }}
      >
        {activeGroupObject.areComplete.has(state.activeJob.jobID)
          ? "Mark As Incomplete"
          : "Mark As Complete"}
      </Button>
    </LockGatedTooltip>
  );
}

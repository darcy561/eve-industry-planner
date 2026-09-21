import { Button } from "@mui/material";
import useUsersStore from "../../../../../../Zustand/usersStore";
import { useActiveJobReadOnly } from "../../../../Edit Job Hooks/useActiveJobDocumentLock";
import {
  LockGatedTooltip,
  lockReasonText,
} from "../../../../../DocumentLock/LockGatedTooltip";
import { useJobDraft } from "../../../../Edit Job Hooks/useJobDraft";

export function MarkAsCompleteButton() {
  const jobID = useJobDraft((job) => job.jobID);
  const { groupArray } = useUsersStore((state) => state.jobData);
  const { updateModifiedGroups, queueJobGroupWritesAndSchedule } =
    useUsersStore((state) => state.jobData.actions);
  const { activeGroupID } = useUsersStore((state) => state.jobData);
  const jobLockReadOnly = useActiveJobReadOnly();

  const activeGroupObject = groupArray.find((i) => i.groupID === activeGroupID);

  function toggleMarkJobAsComplete() {
    if (jobLockReadOnly) return;
    if (!activeGroupObject) return;
    if (activeGroupObject.areComplete.has(jobID)) {
      activeGroupObject.removeAreComplete(jobID);
    } else {
      activeGroupObject.addAreComplete(jobID);
    }
    updateModifiedGroups(activeGroupObject);
    queueJobGroupWritesAndSchedule(activeGroupID);
  }

  // The group comes from the URL, which can name one this planner no longer
  // holds — an old link, or a render before the groups have loaded.
  if (!activeGroupObject) {
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
        {activeGroupObject.areComplete.has(jobID)
          ? "Mark As Incomplete"
          : "Mark As Complete"}
      </Button>
    </LockGatedTooltip>
  );
}

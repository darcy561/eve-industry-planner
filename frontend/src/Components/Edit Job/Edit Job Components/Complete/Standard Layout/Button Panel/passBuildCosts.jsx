import { Button, Tooltip } from "@mui/material";
import { passBuildCostsToParentJobs } from "../../../../../../Functions/Shared/passBuildCosts";
import {
  showSnackbarSuccess,
  showSnackbarError,
} from "../../../../../../Events/snackbarEvents";
import useUsersStore from "../../../../../../Zustand/usersStore";
import { useActiveJobReadOnly } from "../../../../Edit Job Hooks/useActiveJobDocumentLock";
import { lockReasonText } from "../../../../../DocumentLock/LockGatedTooltip";
import {
  jobDraftNow,
  useJobDraft,
} from "../../../../Edit Job Hooks/useJobDraft";

export function PassBuildCostsButton() {
  const hasParents = useJobDraft((job) => job.parentJobs.length > 0);
  const { activeGroupID } = useUsersStore((state) => state.jobData);
  const { getActiveGroupObject } = useUsersStore.getState().jobData.actions;
  const jobLockReadOnly = useActiveJobReadOnly();
  const buttonText = activeGroupID
    ? "Send Build Costs & Complete"
    : "Send Build Costs";

  async function passCost() {
    if (jobLockReadOnly) return;
    const job = jobDraftNow();
    const { messageText } = await passBuildCostsToParentJobs(job);

    if (activeGroupID) {
      const currentGroup = getActiveGroupObject();
      currentGroup.addAreComplete(job.jobID);
    }

    if (messageText) {
      showSnackbarSuccess(messageText);
    } else {
      showSnackbarError(`No build costs imported.`, 3);
    }
  }

  if (!hasParents) {
    return null;
  }

  return (
    <Tooltip
      arrow
      title={
        jobLockReadOnly
          ? lockReasonText({ action: "sending build costs is disabled" })
          : "Sends the item build cost to all parent jobs."
      }
    >
      <span>
        <Button
          color="primary"
          variant="contained"
          size="small"
          onClick={passCost}
          disabled={jobLockReadOnly}
          sx={{ margin: 1 }}
        >
          {buttonText}
        </Button>
      </span>
    </Tooltip>
  );
}

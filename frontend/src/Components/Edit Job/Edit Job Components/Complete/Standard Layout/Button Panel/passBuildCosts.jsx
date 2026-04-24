import { Button, Tooltip } from "@mui/material";
import { passBuildCostsToParentJobs } from "../../../../../../Functions/Shared/passBuildCosts";
import {
  showSnackbarSuccess,
  showSnackbarError,
} from "../../../../../../Events/snackbarEvents";
import useUsersStore from "../../../../../../Zustand/usersStore";

export function PassBuildCostsButton({ state }) {
  const { activeGroupID } = useUsersStore((state) => state.jobData);
  const { getActiveGroupObject } = useUsersStore.getState().jobData.actions;
  const buttonText = activeGroupID
    ? "Send Build Costs & Complete"
    : "Send Build Costs";

  async function passCost() {
    const { messageText } = await passBuildCostsToParentJobs(state.activeJob);

    if (activeGroupID) {
      const currentGroup = getActiveGroupObject();
      currentGroup.addAreComplete(state.activeJob.jobID);
    }

    if (messageText) {
      showSnackbarSuccess(messageText);
    } else {
      showSnackbarError(`No build costs imported.`, 3);
    }
  }

  if (state.activeJob.parentJobs.length === 0) {
    return null;
  }

  return (
    <Tooltip arrow title="Sends the item build cost to all parent jobs.">
      <Button
        color="primary"
        variant="contained"
        size="small"
        onClick={passCost}
        sx={{ margin: 1 }}
      >
        {buttonText}
      </Button>
    </Tooltip>
  );
}

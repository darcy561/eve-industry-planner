import { Button, Tooltip } from "@mui/material";
import { getAnalytics, logEvent } from "firebase/analytics";
import uploadJobSnapshotsToFirebase from "../../../../../../Functions/Firebase/uploadJobSnapshots";
import manageListenerRequests from "../../../../../../Functions/Firebase/manageListenerRequests";
import getCurrentFirebaseUser from "../../../../../../Functions/Firebase/currentFirebaseUser";
import { passBuildCostsToParentJobs } from "../../../../../../Functions/Shared/passBuildCosts";
import {
  showSnackbarSuccess,
  showSnackbarError,
} from "../../../../../../Events/snackbarEvents";
import useUsersStore from "../../../../../../Zustand/usersStore";

export function PassBuildCostsButton({ state }) {
  const { activeGroupID, userJobSnapshot } = useUsersStore((state) => state.jobData);
  const { getActiveGroupObject, addRetrievedJobsToJobArray } = useUsersStore.getState().jobData.actions;
  const isLoggedIn = useUsersStore((state) => state.users.isLoggedIn);
  const analytics = getAnalytics();

  const buttonText = activeGroupID
    ? "Send Build Costs & Complete"
    : "Send Build Costs";

  async function passCost() {
    const { messageText, retrievedJobs } = await passBuildCostsToParentJobs(
      state.activeJob,
    );

    if (activeGroupID) {
      const currentGroup = getActiveGroupObject();
      currentGroup.addAreComplete(state.activeJob.jobID);
    }

    if (messageText) {
      showSnackbarSuccess(messageText);
    } else {
      showSnackbarError(`No build costs imported.`, 3);
    }
    manageListenerRequests(retrievedJobs);

    logEvent(analytics, "Import Costs", {
      UID: getCurrentFirebaseUser(),
      isLoggedIn: isLoggedIn,
    });

    addRetrievedJobsToJobArray(retrievedJobs);

    if (isLoggedIn) {
      await uploadJobSnapshotsToFirebase(userJobSnapshot);
    }
  }

  if (state.activeJob.parentJob.length === 0) {
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

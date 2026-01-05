import { Button, Tooltip } from "@mui/material";
import { getAnalytics, logEvent } from "firebase/analytics";
import { useNavigate } from "@tanstack/react-router";
import deleteJobFromFirebase from "../../../../../../Functions/Firebase/deleteJob";
import uploadJobSnapshotsToFirebase from "../../../../../../Functions/Firebase/uploadJobSnapshots";
import uploadApplicationSettingsToFirebase from "../../../../../../Functions/Firebase/uploadApplicationSettings";
import archiveJobInFirebase from "../../../../../../Functions/Firebase/archiveJob";
import { showSnackbarSuccess } from "../../../../../../Events/snackbarEvents";
import useUsersStore from "../../../../../../Zustand/usersStore";
import getCurrentFirebaseUser from "../../../../../../Functions/Firebase/currentFirebaseUser";

export function ArchiveJobButton({ state }) {
  const { activeGroupID, userJobSnapshot } = useUsersStore((state) => state.jobData);
  const { removeJobsFromUserJobSnapshotArray, removeJobsFromJobArray } = useUsersStore.getState().jobData.actions;
  const isLoggedIn = useUsersStore((state) => state.users.isLoggedIn);
  const analytics = getAnalytics();
  const navigate = useNavigate({ from: '/editjob/$jobID' });

  const archiveJobProcess = async () => {
    logEvent(analytics, "Archive Job", {
      UID: getCurrentFirebaseUser(),
      jobID: state.activeJob.jobID,
      itemID: state.activeJob.itemID,
    });

    useUsersStore.getState().users.actions.addLinkedEsiData({
      ordersToAdd: new Set(),
      jobsToAdd: new Set(),
      transactionsToAdd: new Set(),
      ordersToRemove: state.activeJob.apiOrders,
      jobsToRemove: state.activeJob.apiJobs,
      transactionsToRemove: state.activeJob.apiTransactions,
    });

    showSnackbarSuccess(`${state.activeJob.name} Archived`);

    await uploadJobSnapshotsToFirebase(userJobSnapshot.filter(i => i.jobID !== state.activeJob.jobID));
    await archiveJobInFirebase(state.activeJob);
    await deleteJobFromFirebase(state.activeJob);
    await uploadApplicationSettingsToFirebase();
    removeJobsFromJobArray(state.activeJob.jobID);
    removeJobsFromUserJobSnapshotArray(state.activeJob.jobID);
    navigate({ to: "/jobplanner" });
  };

  if (!isLoggedIn || activeGroupID) {
    return null;
  }

  return (
    <Tooltip
      arrow
      title="Removes the job from your planner but stores the data for later use in reporting and cost calculations. If you do not wish to store this job data then simply delete the job."
    >
      <Button
        color="primary"
        variant="contained"
        size="small"
        onClick={archiveJobProcess}
        sx={{ margin: 1 }}
      >
        Archive Job
      </Button>
    </Tooltip>
  );
}

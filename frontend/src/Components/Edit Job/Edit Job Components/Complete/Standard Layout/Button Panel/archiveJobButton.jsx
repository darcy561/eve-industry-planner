import { Button, Tooltip } from "@mui/material";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import deleteJobFromFirebase from "../../../../../../Functions/Firebase/deleteJob";
import uploadJobSnapshotsToFirebase from "../../../../../../Functions/Firebase/uploadJobSnapshots";
import { saveUserAccountDocument } from "../../../../../../Functions/Endpoints/Pirivate/userDocument";
import saveArchivedJobs from "../../../../../../Functions/Endpoints/Pirivate/archivedJobs";
import {
  showSnackbarError,
  showSnackbarSuccess,
} from "../../../../../../Events/snackbarEvents";
import useUsersStore from "../../../../../../Zustand/usersStore";
import { invalidateBuildStatsQuery } from "../../../../../../Hooks/React Query/Backend/buildStats";

export function ArchiveJobButton({ state }) {
  const { activeGroupID, userJobSnapshot } = useUsersStore((state) => state.jobData);
  const { removeJobsFromUserJobSnapshotArray, removeJobsFromJobArray } = useUsersStore.getState().jobData.actions;
  const isLoggedIn = useUsersStore((state) => state.account.isLoggedIn);
  const navigate = useNavigate({ from: '/editjob/$jobID' });
  const queryClient = useQueryClient();

  const archiveJobProcess = async () => {
    useUsersStore.getState().account.actions.addLinkedEsiData({
      ordersToAdd: new Set(),
      jobsToAdd: new Set(),
      transactionsToAdd: new Set(),
      ordersToRemove: state.activeJob.apiOrders,
      jobsToRemove: state.activeJob.apiJobs,
      transactionsToRemove: state.activeJob.apiTransactions,
    });

    const archivedOk = await saveArchivedJobs([state.activeJob]);
    if (!archivedOk) {
      showSnackbarError("Could not archive job on the server. Please try again.");
      return;
    }

    invalidateBuildStatsQuery(queryClient, state.activeJob.itemID);

    showSnackbarSuccess(`${state.activeJob.name} Archived`);

    await uploadJobSnapshotsToFirebase(userJobSnapshot.filter(i => i.jobID !== state.activeJob.jobID));
    await deleteJobFromFirebase(state.activeJob);
    await saveUserAccountDocument();
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

import { Button, Tooltip } from "@mui/material";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { deleteJobDocumentsFromApi } from "../../../../../../Functions/Endpoints/Private/jobDocuments.js";
import { flushPendingJobDocumentsSave } from "../../../../../../Functions/Debounce/jobDocumentsPersistSchedule.js";
import { saveUserAccountDocument } from "../../../../../../Functions/Endpoints/Private/userDocument";
import saveArchivedJobs from "../../../../../../Functions/Endpoints/Private/archivedJobs";
import { markJobsArchivedInGroups } from "../../../../../../Functions/Groups/markJobsArchivedInGroups.js";
import {
  showSnackbarError,
  showSnackbarSuccess,
} from "../../../../../../Events/snackbarEvents";
import useUsersStore from "../../../../../../Zustand/usersStore";
import { invalidateStatisticsQueries } from "../../../../../../Hooks/React Query/Backend/statisticsKeys";
import { useActiveJobReadOnly } from "../../../../Edit Job Hooks/useActiveJobDocumentLock";
import { lockReasonText } from "../../../../../DocumentLock/LockGatedTooltip";
import { yieldEditJobDocumentLocksOnLeave } from "../../../../../../Functions/DocumentLock/yieldEditJobDocumentLocksOnLeave.js";

export function ArchiveJobButton({ state }) {
  const { activeGroupID } = useUsersStore((state) => state.jobData);
  const { removeJobsFromJobArray } = useUsersStore.getState().jobData.actions;
  const isLoggedIn = useUsersStore((state) => state.account.isLoggedIn);
  const navigate = useNavigate({ from: '/editjob/$jobID' });
  const { jobID } = useParams({ from: "/editjob/$jobID" });
  const queryClient = useQueryClient();
  const jobLockReadOnly = useActiveJobReadOnly(state);

  const archiveJobProcess = async () => {
    if (jobLockReadOnly) return;
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

    invalidateStatisticsQueries(queryClient);

    await markJobsArchivedInGroups([state.activeJob]);

    try {
      await flushPendingJobDocumentsSave();
      await deleteJobDocumentsFromApi([state.activeJob.jobID]);
    } catch (err) {
      console.error(err);
      showSnackbarError(
        "Job was archived but removing it from the server failed. Try refreshing or deleting from the planner.",
        5
      );
      return;
    }

    showSnackbarSuccess(`${state.activeJob.name} Archived`);

    await saveUserAccountDocument();
    removeJobsFromJobArray(state.activeJob.jobID);
    await yieldEditJobDocumentLocksOnLeave({ jobID, groupID: null });
    navigate({ to: "/jobplanner" });
  };

  if (!isLoggedIn || activeGroupID) {
    return null;
  }

  return (
    <Tooltip
      arrow
      title={
        jobLockReadOnly
          ? lockReasonText({ action: "archiving is disabled" })
          : "Removes the job from your planner but stores the data for later use in reporting and cost calculations. If you do not wish to store this job data then simply delete the job."
      }
    >
      <span>
        <Button
          color="primary"
          variant="contained"
          size="small"
          onClick={archiveJobProcess}
          disabled={jobLockReadOnly}
          sx={{ margin: 1 }}
        >
          Archive Job
        </Button>
      </span>
    </Tooltip>
  );
}

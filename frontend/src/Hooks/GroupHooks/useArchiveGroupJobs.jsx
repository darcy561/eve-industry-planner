import { getAnalytics, logEvent } from "firebase/analytics";
import { useQueryClient } from "@tanstack/react-query";
import uploadGroupsToFirebase from "../../Functions/Firebase/uploadGroupData";
import saveArchivedJobs from "../../Functions/Endpoints/Pirivate/archivedJobs";
import { invalidateAllBuildStatsQueries } from "../React Query/Backend/buildStats";
import closeFirebaseListeners from "../../Functions/Firebase/closeListenerRequests";
import firebaseBatchDeleteJobs from "../../Functions/Firebase/batchDeleteJobs";
import {
  showSnackbarError,
  showSnackbarSuccess,
} from "../../Events/snackbarEvents";
import useUsersStore from "../../Zustand/usersStore";
import { saveUserAccountDocument } from "../../Functions/Endpoints/Pirivate/userDocument";

/**
 * Custom hook that provides functionality to archive group jobs in EVE Online industry planning.
 *
 * This hook:
 * - Archives selected jobs from the active group
 * - Removes jobs from the active job array
 * - Updates linked ESI data (orders, transactions, jobs)
 * - Archives jobs in Firebase when user is logged in
 * - Closes Firebase listeners for archived jobs
 * - Updates group data and application settings
 * - Logs analytics events for tracking
 *
 * The archiving process:
 * 1. Filters jobs that aren't in user job snapshots
 * 2. Collects linked ESI data from selected jobs
 * 3. Removes jobs from active arrays and ESI data
 * 4. Archives jobs in Firebase (if logged in)
 * 5. Updates group data and settings
 * 6. Shows success notification
 *
 * @returns {Object} Object containing archive functions
 * @returns {Function} returns.archiveGroupJobs - Archives selected jobs from the active group
 *
 * @example
 * function GroupArchiver() {
 *   const { archiveGroupJobs } = useArchiveGroupJobs();
 *
 *   const handleArchive = async (selectedJobs) => {
 *     await archiveGroupJobs(selectedJobs);
 *     console.log("Group jobs archived successfully");
 *   };
 *
 *   return <button onClick={() => handleArchive(selectedJobs)}>Archive Group</button>;
 * }
 */
export function useArchiveGroupJobs() {
  const queryClient = useQueryClient();
  const { userJobSnapshot, jobArray } = useUsersStore((state) => state.jobData);
  const {
    setActiveGroupID,
    removeGroupFromGroupArray,
    getActiveGroupObject,
    replaceJobArray,
  } = useUsersStore.getState().jobData.actions;
  const isLoggedIn = useUsersStore((state) => state.account.isLoggedIn);
  const analytics = getAnalytics();

  const archiveGroupJobs = async (selectedJobs) => {
    const { groupID, groupName } = getActiveGroupObject();
    let newLinkedOrders = new Set();
    let newLinkedTrans = new Set();
    let newLinkedJobs = new Set();

    const filteredJobs = selectedJobs.filter(
      (job) => !userJobSnapshot.some((i) => i.jobID === job.jobID),
    );

    logEvent(analytics, "Archive Group Jobs", {
      UID: useUsersStore.getState().account.actions.getAccountID(),
      groupID: groupID,
      groupSize: filteredJobs.length,
    });

    for (let selectedJob of filteredJobs) {
      newLinkedOrders = new Set([...newLinkedOrders], selectedJob.apiOrders);
      newLinkedTrans = new Set([...newLinkedTrans], selectedJob.linkedTrans);
      newLinkedJobs = new Set([...newLinkedJobs], selectedJob.linkedJobs);
    }

    let newJobArray = jobArray.filter(
      (i) =>
        selectedJobs.some((z) => z.jobID === i.jobID) &&
        !userJobSnapshot.some((x) => x.job === i.jobID),
    );

    useUsersStore.getState().account.actions.addLinkedEsiData({
      ordersToAdd: new Set(),
      jobsToAdd: new Set(),
      transactionsToAdd: new Set(),
      ordersToRemove: newLinkedOrders,
      jobsToRemove: newLinkedJobs,
      transactionsToRemove: newLinkedTrans,
    });

    setActiveGroupID(null);
    removeGroupFromGroupArray(groupID);
    replaceJobArray(newJobArray);

    if (isLoggedIn) {
      closeFirebaseListeners(filteredJobs);

      const archivedOk = await saveArchivedJobs(filteredJobs);
      if (!archivedOk) {
        showSnackbarError("Some jobs could not be archived on the server.", 5);
        return;
      }

      if (archivedOk) {
        invalidateAllBuildStatsQueries(queryClient);
      }

      await Promise.all([
        ...(archivedOk ? [firebaseBatchDeleteJobs(filteredJobs)] : []),
        uploadGroupsToFirebase(),
        saveUserAccountDocument(),
      ]);
    }
    showSnackbarSuccess(`${groupName} Archived`, 3);
  };

  return {
    archiveGroupJobs,
  };
}

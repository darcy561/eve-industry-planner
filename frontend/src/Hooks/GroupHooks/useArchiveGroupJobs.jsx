import { getAnalytics, logEvent } from "firebase/analytics";
import uploadGroupsToFirebase from "../../Functions/Firebase/uploadGroupData";
import archiveJobInFirebase from "../../Functions/Firebase/archiveJob";
import closeFirebaseListeners from "../../Functions/Firebase/closeListenerRequests";
import firebaseBatchDeleteJobs from "../../Functions/Firebase/batchDeleteJobs";
import { showSnackbarSuccess } from "../../Events/snackbarEvents";
import useUsersStore from "../../Zustand/usersStore";
import uploadApplicationSettingsToFirebase from "../../Functions/Firebase/uploadApplicationSettings";

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
  const { userJobSnapshot, jobArray } = useUsersStore((state) => state.jobData);
  const {
    setActiveGroupID,
    removeGroupFromGroupArray,
    getActiveGroupObject,
    replaceJobArray,
  } = useUsersStore.getState().jobData.actions;
  const isLoggedIn = useUsersStore((state) => state.users.isLoggedIn);
  const analytics = getAnalytics();

  const archiveGroupJobs = async (selectedJobs) => {
    const { groupID, groupName } = getActiveGroupObject();
    let newLinkedOrders = new Set();
    let newLinkedTrans = new Set();
    let newLinkedJobs = new Set();

    const filteredJobs = selectedJobs.filter(
      (job) => !userJobSnapshot.some((i) => i.jobID === job.jobID)
    );

    logEvent(analytics, "Archive Group Jobs", {
      UID: useUsersStore.getState().users.actions.findParentUser().accountID,
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
        !userJobSnapshot.some((x) => x.job === i.jobID)
    );

    useUsersStore.getState().users.actions.addLinkedEsiData({
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

      await Promise.all(filteredJobs.map((job) => archiveJobInFirebase(job)));

      await Promise.all([
        firebaseBatchDeleteJobs(filteredJobs),
        uploadGroupsToFirebase(),
        uploadApplicationSettingsToFirebase(),
      ]);
    }
    showSnackbarSuccess(`${groupName} Archived`, 3);
  };

  return {
    archiveGroupJobs,
  };
}
0;

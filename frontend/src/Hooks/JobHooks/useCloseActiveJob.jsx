import JobSnapshot from "../../Classes/jobSnapshotConstructor";
import uploadJobSnapshotsToFirebase from "../../Functions/Firebase/uploadJobSnapshots";
import manageListenerRequests from "../../Functions/Firebase/manageListenerRequests";
import applyParentChildChanges from "../../Components/Edit Job/functions/applyParentChildChanges";
import repairMissingParentChildRelationships from "../../Functions/Shared/repairParentChildRelationships";
import materialTreeShaker from "../../Functions/Helper/materialTreeShaker";
import getAllRelatedJobs from "../../Functions/Helper/getAllRelatedJobs";
import { useRecalcuateJob } from "../GeneralHooks/useRecalculateJob";
import firebaseBatchUpdateJobs from "../../Functions/Firebase/batchUpdateJobs";
import { showSnackbarInfo } from "../../Events/snackbarEvents";
import useUsersStore from "../../Zustand/usersStore";
import uploadApplicationSettingsToFirebase from "../../Functions/Firebase/uploadApplicationSettings";

/**
 * Custom hook that provides functionality to close and finalize active jobs in EVE Online industry planning.
 * 
 * This hook handles the complex process of closing active jobs:
 * - Applies parent-child relationship changes
 * - Repairs missing parent-child relationships
 * - Performs automatic job recalculation if enabled
 * - Updates job snapshots and group data
 * - Manages ESI data linking (orders, transactions, jobs)
 * - Updates Firebase with all changes
 * - Manages Firebase listeners for real-time updates
 * - Handles both individual jobs and group jobs
 * 
 * The job closing process:
 * 1. Applies parent-child relationship modifications
 * 2. Repairs any missing relationships
 * 3. Recalculates related jobs if automatic recalculation is enabled
 * 4. Updates job snapshots and group assignments
 * 5. Links/removes ESI data (market orders, industry jobs, transactions)
 * 6. Saves all changes to Firebase
 * 7. Updates local state and listeners
 * 8. Clears active job state
 * 
 * @returns {Object} Object containing job closing functions
 * @returns {Function} returns.closeActiveJob - Closes and finalizes the active job
 * 
 * @example
 * function JobCloser() {
 *   const { closeActiveJob } = useCloseActiveJob();
 * 
 *   const handleCloseJob = async (job, modified, tempJobs, esiData, parentChild) => {
 *     await closeActiveJob(job, modified, tempJobs, esiData, parentChild);
 *     console.log("Job closed and finalized");
 *   };
 * 
 *   return <button onClick={() => handleCloseJob(...params)}>Close Job</button>;
 * }
 */
export function useCloseActiveJob() {
  const { groupArray, userJobSnapshot } = useUsersStore((state) => state.jobData);
  const { setActiveJobID, replaceGroupArray, getGroupObject, replaceUserJobSnapshotArray, updateOrAddJobsToJobArray, findJobInJobArray } = useUsersStore.getState().jobData.actions;
  const isLoggedIn = useUsersStore((state) => state.users.isLoggedIn);
  const automaticJobRecalculation =
    useUsersStore.getState().applicationSettings.automaticJobRecalculation;
  const { recalculateJobForNewTotal } = useRecalcuateJob();

  async function closeActiveJob(
    inputJob,
    jobModifiedFlag,
    tempJobsToAdd,
    esiDataToLink,
    parentChildToEdit
  ) {
    if (!jobModifiedFlag) {
      setActiveJobID(null);
      return;
    }
    let recalculatedJobIds = new Set();
    const retrievedJobs = Object.values(tempJobsToAdd);
    const IDsOfNewJobs = new Set(
      Object.values(tempJobsToAdd).map(({ jobID }) => jobID)
    );
    let newUserJobSnapshot = [...userJobSnapshot];

    const modifiedLinkedJobIDs = await applyParentChildChanges(
      parentChildToEdit,
      inputJob,
      retrievedJobs
    );
    const repairedJobIDs = await repairMissingParentChildRelationships(
      inputJob,
      retrievedJobs
    );

    if (automaticJobRecalculation) {
      const allRelatedJobs = await getAllRelatedJobs(
        inputJob.jobID,
        retrievedJobs
      );

      const existingObject = allRelatedJobs.findIndex((job) => job.jobID === inputJob.jobID);
      if (existingObject !== -1) {
        allRelatedJobs[existingObject] = inputJob;
      }

      recalculatedJobIds = materialTreeShaker(
        allRelatedJobs,
        recalculateJobForNewTotal
      );
    }

    const finalModifiedIDSet = new Set(
      [
        ...modifiedLinkedJobIDs,
        ...repairedJobIDs,
        ...recalculatedJobIds,
      ].filter((id) => !IDsOfNewJobs.has(id))
    );



    const batchUpdates = [];
    for (let modifiedID of finalModifiedIDSet) {
      let matchedJob = findJobInJobArray(modifiedID)
      if(matchedJob.jobID === inputJob.jobID) {
        matchedJob = inputJob;
      }
      if (!matchedJob) return;

      const matchedSnapshot = newUserJobSnapshot.find(
        (i) => i.jobID === matchedJob.jobID
      );

      if (matchedSnapshot) {
        matchedSnapshot.setSnapshot(matchedJob);
      }

      batchUpdates.push(matchedJob);
    }

    if (!inputJob.groupID) {
      for (let newJob of Object.values(tempJobsToAdd)) {
        newUserJobSnapshot.push(new JobSnapshot(newJob));
      }
    } else {
      const matchedGroup = getGroupObject(inputJob.groupID);
      if (matchedGroup) {
        matchedGroup.addJobsToGroup(Object.values(tempJobsToAdd));
      }
    }

    if (
      inputJob.groupID !== null &&
      inputJob.isReadyToSell &&
      !newUserJobSnapshot.some((i) => i.jobID === inputJob.jobID)
    ) {
      newUserJobSnapshot.push(new JobSnapshot(inputJob));
    } else {
      const matchedSnapshot = newUserJobSnapshot.find(
        (i) => i.jobID === inputJob.jobID
      );

      if (matchedSnapshot) {
        matchedSnapshot.setSnapshot(inputJob);
      }
    }

    if (isLoggedIn) {
      await uploadJobSnapshotsToFirebase(newUserJobSnapshot);
      await firebaseBatchUpdateJobs([
        inputJob,
        ...Object.values(tempJobsToAdd),
        ...batchUpdates,
      ]);
    }

    // Only update linked ESI data if there are actual changes
    const hasOrdersToAdd =
      esiDataToLink.marketOrders.add &&
      esiDataToLink.marketOrders.add.length > 0;
    const hasJobsToAdd =
      esiDataToLink.industryJobs.add &&
      esiDataToLink.industryJobs.add.length > 0;
    const hasTransactionsToAdd =
      esiDataToLink.transactions.add &&
      esiDataToLink.transactions.add.length > 0;
    const hasOrdersToRemove =
      esiDataToLink.marketOrders.remove &&
      esiDataToLink.marketOrders.remove.length > 0;
    const hasJobsToRemove =
      esiDataToLink.industryJobs.remove &&
      esiDataToLink.industryJobs.remove.length > 0;
    const hasTransactionsToRemove =
      esiDataToLink.transactions.remove &&
      esiDataToLink.transactions.remove.length > 0;

    const hasAnyChanges =
      hasOrdersToAdd ||
      hasJobsToAdd ||
      hasTransactionsToAdd ||
      hasOrdersToRemove ||
      hasJobsToRemove ||
      hasTransactionsToRemove;

    useUsersStore.getState().users.actions.addLinkedEsiData({
      ordersToAdd: esiDataToLink.marketOrders.add,
      jobsToAdd: esiDataToLink.industryJobs.add,
      transactionsToAdd: esiDataToLink.transactions.add,
      ordersToRemove: esiDataToLink.marketOrders.remove,
      jobsToRemove: esiDataToLink.industryJobs.remove,
      transactionsToRemove: esiDataToLink.transactions.remove,
    });

    if (hasAnyChanges && isLoggedIn) {
      await uploadApplicationSettingsToFirebase();
    }

    manageListenerRequests(retrievedJobs);

    if (inputJob.groupID) {
      replaceGroupArray([...groupArray]);
    }

    updateOrAddJobsToJobArray([...retrievedJobs, ...batchUpdates]);
    replaceUserJobSnapshotArray(newUserJobSnapshot);
    setActiveJobID(null);

    showSnackbarInfo(`${inputJob.name} Updated`);
  }

  return {
    closeActiveJob,
  };
}

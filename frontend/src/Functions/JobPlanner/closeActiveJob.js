import applyParentChildChanges from "../../Components/Edit Job/functions/applyParentChildChanges";
import repairMissingParentChildRelationships from "../Shared/repairParentChildRelationships";
import normalizeParentChildRelationships from "../Shared/normalizeParentChildRelationships.js";
import materialTreeShaker from "../Helper/materialTreeShaker";
import getAllRelatedJobs from "../Helper/getAllRelatedJobs";
import { saveJobsViaApi } from "../JobDocuments/saveJobsViaApi.js";
import { showSnackbarInfo } from "../../Events/snackbarEvents";
import useUsersStore from "../../Zustand/usersStore";
import { saveUserAccountDocument } from "../Endpoints/Pirivate/userDocument";
import recalculateJobForNewTotal from "./recalculateJobForNewTotal";

export default async function closeActiveJob(
  inputJob,
  jobModifiedFlag,
  tempJobsToAdd,
  esiDataToLink,
  parentChildToEdit,
  queryClient
) {
  const {
    setActiveJobID,
    updateModifiedGroups,
    queueJobGroupWritesAndSchedule,
    getGroupObject,
    updateOrAddJobsToJobArray,
    findJobInJobArray,
  } = useUsersStore.getState().jobData.actions;

  const isLoggedIn = useUsersStore.getState().account.isLoggedIn;
  const automaticJobRecalculation =
    useUsersStore.getState().applicationSettings.enableAutomaticJobRecalculation;

  if (!jobModifiedFlag) {
    setActiveJobID(null);
    return;
  }

  let recalculatedJobIds = new Set();
  const tempJobs = Object.values(tempJobsToAdd);
  const IDsOfNewJobs = new Set(
    Object.values(tempJobsToAdd).map(({ jobID }) => jobID)
  );
  const modifiedLinkedJobIDs = applyParentChildChanges(
    parentChildToEdit,
    inputJob,
    tempJobs
  );
  const repairedJobIDs = repairMissingParentChildRelationships(
    inputJob,
    tempJobs
  );
  const allRelatedJobs = getAllRelatedJobs(inputJob.jobID);
  const normalizedJobIDs = normalizeParentChildRelationships([
    inputJob,
    ...tempJobs,
    ...allRelatedJobs,
  ]);

  if (automaticJobRecalculation) {
    const existingObject = allRelatedJobs.findIndex(
      (job) => job.jobID === inputJob.jobID
    );
    if (existingObject !== -1) {
      allRelatedJobs[existingObject] = inputJob;
    }

    recalculatedJobIds = materialTreeShaker(
      allRelatedJobs,
      (job, requiredQuantity) =>
        recalculateJobForNewTotal(job, requiredQuantity, queryClient)
    );
  }

  const finalModifiedIDSet = new Set(
    [
      ...modifiedLinkedJobIDs,
      ...repairedJobIDs,
      ...normalizedJobIDs,
      ...recalculatedJobIds,
    ].filter((id) => !IDsOfNewJobs.has(id))
  );

  const batchUpdates = [];
  for (const modifiedID of finalModifiedIDSet) {
    let matchedJob = findJobInJobArray(modifiedID);
    if (!matchedJob) continue;
    if (matchedJob.jobID === inputJob.jobID) {
      matchedJob = inputJob;
    }
    batchUpdates.push(matchedJob);
  }

  if (inputJob.includedInGroup) {
    const matchedGroup = getGroupObject(inputJob.groupID);
    if (matchedGroup) {
      matchedGroup.addJobsToGroup(Object.values(tempJobsToAdd));
    }
  }

  const existingPlannerRow = findJobInJobArray(inputJob.jobID);
  if (
    inputJob.includedInGroup &&
    inputJob.isReadyToSell &&
    !existingPlannerRow?.displayOnPlanner
  ) {
    inputJob.displayOnPlanner = true;
  }

  if (isLoggedIn) {
    await saveJobsViaApi([inputJob, ...Object.values(tempJobsToAdd), ...batchUpdates]);
  }

  const hasAnyChanges =
    (esiDataToLink.marketOrders.add && esiDataToLink.marketOrders.add.length > 0) ||
    (esiDataToLink.industryJobs.add && esiDataToLink.industryJobs.add.length > 0) ||
    (esiDataToLink.transactions.add && esiDataToLink.transactions.add.length > 0) ||
    (esiDataToLink.marketOrders.remove &&
      esiDataToLink.marketOrders.remove.length > 0) ||
    (esiDataToLink.industryJobs.remove &&
      esiDataToLink.industryJobs.remove.length > 0) ||
    (esiDataToLink.transactions.remove &&
      esiDataToLink.transactions.remove.length > 0);

  useUsersStore.getState().account.actions.addLinkedEsiData({
    ordersToAdd: esiDataToLink.marketOrders.add,
    jobsToAdd: esiDataToLink.industryJobs.add,
    transactionsToAdd: esiDataToLink.transactions.add,
    ordersToRemove: esiDataToLink.marketOrders.remove,
    jobsToRemove: esiDataToLink.industryJobs.remove,
    transactionsToRemove: esiDataToLink.transactions.remove,
  });

  if (hasAnyChanges && isLoggedIn) {
    await saveUserAccountDocument();
  }

  if (inputJob.includedInGroup) {
    const updatedGroup = getGroupObject(inputJob.groupID);
    if (updatedGroup?.groupID) {
      updateModifiedGroups(updatedGroup);
      queueJobGroupWritesAndSchedule(inputJob.groupID);
    }
  }

  updateOrAddJobsToJobArray([inputJob, ...tempJobs, ...batchUpdates]);
  setActiveJobID(null);
  showSnackbarInfo(`${inputJob.name} Updated`);
}

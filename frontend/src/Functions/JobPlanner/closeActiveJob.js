import { totalQuantityProduced } from "../../Components/Edit Job/Edit Job Hooks/jobSelectors";
import applyParentChildChanges from "../../Components/Edit Job/functions/applyParentChildChanges";
import repairMissingParentChildRelationships from "../Shared/repairParentChildRelationships";
import normaliseParentChildRelationships from "../Shared/normaliseParentChildRelationships.js";
import materialTreeShaker from "../Helper/materialTreeShaker";
import getAllRelatedJobs from "../Helper/getAllRelatedJobs";
import { canPersistJobClose } from "../DocumentLock/canPersistDocumentEditClose.js";
import {
  restoreSavedJobs,
  saveJobsAsOneChange,
} from "../JobDocuments/saveJobsViaApi.js";
import { openChangeReview } from "../../Events/changeReviewEvents";
import {
  showSnackbarInfo,
  showSnackbarWarning,
} from "../../Events/snackbarEvents";
import useUsersStore from "../../Zustand/usersStore";
import workingCopyOfJob from "./workingCopyOfJob";
import { endEditSession } from "./editSessionLifetime.js";
import { saveUserAccountDocument } from "../Endpoints/Private/userDocument";
import recalculateJobForNewTotal from "./recalculateJobForNewTotal";
import { closeAdjustmentSummary } from "./closeAdjustmentSummary";

/**
 * Saves the job being edited with every job its close links, repairs or resizes, and ends the edit;
 * a refused save keeps the editor open on the saved copies and the reader's changes.
 *
 * @returns {Promise<"closed"|"kept-open">}
 */
export default async function closeActiveJob(
  jobToSave,
  jobModifiedFlag,
  tempJobsToAdd,
  esiDataToLink,
  parentChildToEdit,
  queryClient,
  changesToEditedJob,
) {
  const inputJob = workingCopyOfJob(jobToSave);

  const {
    updateModifiedGroups,
    getGroupObject,
    clearPendingJobDocumentWrites,
    clearPendingJobGroupWrites,
    updateOrAddJobsToJobArray,
    findJobInJobArray,
  } = useUsersStore.getState().jobData.actions;

  const isLoggedIn = useUsersStore.getState().account.isLoggedIn;
  const automaticJobRecalculation =
    useUsersStore.getState().applicationSettings
      .enableAutomaticJobRecalculation;

  if (!jobModifiedFlag) {
    endEditSession();
    return "closed";
  }

  if (!inputJob?.jobID) {
    endEditSession();
    return "closed";
  }

  if (!findJobInJobArray(inputJob.jobID)) {
    showSnackbarWarning(
      "This job was removed while you had it open, so your changes were not saved.",
      8,
    );
    endEditSession();
    return "closed";
  }

  let recalculatedJobIds = new Set();
  const adjustments = [];
  const tempJobsSource = tempJobsToAdd ?? {};
  const tempJobs = Object.values(tempJobsSource);
  const IDsOfNewJobs = new Set(
    Object.values(tempJobsSource).map(({ jobID }) => jobID),
  );
  const modifiedLinkedJobIDs = applyParentChildChanges(
    parentChildToEdit,
    inputJob,
    tempJobs,
  );
  const repairedJobIDs = repairMissingParentChildRelationships(
    inputJob,
    tempJobs,
  );
  const allRelatedJobs = getAllRelatedJobs(inputJob.jobID);
  const normalizedJobIDs = normaliseParentChildRelationships([
    inputJob,
    ...tempJobs,
    ...allRelatedJobs,
  ]);

  if (automaticJobRecalculation) {
    const existingObject = allRelatedJobs.findIndex(
      (job) => job.jobID === inputJob.jobID,
    );
    if (existingObject !== -1) {
      allRelatedJobs[existingObject] = inputJob;
    }

    recalculatedJobIds = materialTreeShaker(
      allRelatedJobs,
      (job, requiredQuantity) => {
        const before = totalQuantityProduced(job);
        recalculateJobForNewTotal(job, requiredQuantity, queryClient);
        const after = totalQuantityProduced(job);
        if (before !== after) {
          adjustments.push({ jobID: job.jobID, name: job.name, before, after });
        }
      },
    );
  }

  const finalModifiedIDSet = new Set(
    [
      ...modifiedLinkedJobIDs,
      ...repairedJobIDs,
      ...normalizedJobIDs,
      ...recalculatedJobIds,
    ].filter((id) => !IDsOfNewJobs.has(id)),
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

  const existingPlannerRow = findJobInJobArray(inputJob.jobID);
  if (
    inputJob.includedInGroup &&
    inputJob.isReadyToSell &&
    !existingPlannerRow?.displayOnPlanner
  ) {
    inputJob.displayOnPlanner = true;
  }

  const persistToServer = isLoggedIn && canPersistJobClose(inputJob.jobID);

  const jobsToPersist = [
    inputJob,
    ...Object.values(tempJobsSource),
    ...batchUpdates,
  ];

  if (persistToServer) {
    const outcome = await saveJobsAsOneChange(
      jobsToPersist,
      changesToEditedJob?.length
        ? { [inputJob.jobID]: changesToEditedJob }
        : undefined,
    );
    if (outcome !== "saved") {
      await restoreSavedJobs(
        jobsToPersist
          .map((job) => job.jobID)
          .filter((jobID) => !IDsOfNewJobs.has(jobID)),
        [...IDsOfNewJobs],
      );
      if (outcome === "conflict") {
        openChangeReview({ refused: true });
      }
      return "kept-open";
    }
  }

  const esl = esiDataToLink ?? {};
  const eslMo = esl.marketOrders ?? { add: [], remove: [] };
  const eslIj = esl.industryJobs ?? { add: [], remove: [] };
  const eslTr = esl.transactions ?? { add: [], remove: [] };
  const hasAnyChanges =
    eslMo.add?.length > 0 ||
    eslIj.add?.length > 0 ||
    eslTr.add?.length > 0 ||
    eslMo.remove?.length > 0 ||
    eslIj.remove?.length > 0 ||
    eslTr.remove?.length > 0;

  useUsersStore.getState().account.actions.addLinkedEsiData({
    ordersToAdd: eslMo.add,
    jobsToAdd: eslIj.add,
    transactionsToAdd: eslTr.add,
    ordersToRemove: eslMo.remove,
    jobsToRemove: eslIj.remove,
    transactionsToRemove: eslTr.remove,
  });

  if (hasAnyChanges && persistToServer) {
    await saveUserAccountDocument();
  }

  if (inputJob.includedInGroup) {
    const updatedGroup = getGroupObject(inputJob.groupID);
    updatedGroup?.addJobsToGroup(tempJobs);
    if (updatedGroup?.groupID) {
      updateModifiedGroups(updatedGroup, { queuePersist: persistToServer });
      if (!persistToServer) {
        clearPendingJobGroupWrites(updatedGroup.groupID);
      }
    }
  }

  if (isLoggedIn && !persistToServer) {
    const pendingJobIDs = jobsToPersist.map((j) => j?.jobID).filter(Boolean);
    if (pendingJobIDs.length > 0) {
      clearPendingJobDocumentWrites(pendingJobIDs);
    }
  }

  updateOrAddJobsToJobArray([inputJob, ...tempJobs, ...batchUpdates]);
  endEditSession();
  if (persistToServer) {
    showSnackbarInfo(closeAdjustmentSummary(inputJob, adjustments), 5);
    return "closed";
  }
  if (isLoggedIn) {
    showSnackbarWarning(
      "You do not hold the lock on this job, so your changes were not saved.",
      8,
    );
  }
  return "closed";
}

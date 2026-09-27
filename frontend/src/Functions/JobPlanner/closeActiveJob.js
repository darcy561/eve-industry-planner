import { totalQuantityProduced } from "../../Components/Edit Job/Edit Job Hooks/jobSelectors";
import applyParentChildChanges from "../../Components/Edit Job/functions/applyParentChildChanges";
import repairMissingParentChildRelationships from "../Shared/repairParentChildRelationships";
import normaliseParentChildRelationships from "../Shared/normaliseParentChildRelationships.js";
import materialTreeShaker from "../Helper/materialTreeShaker";
import getAllRelatedJobs from "../Helper/getAllRelatedJobs";
import { canPersistJobClose } from "../DocumentLock/canPersistDocumentEditClose.js";
import { saveJobsViaApi } from "../JobDocuments/saveJobsViaApi.js";
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
    return;
  }

  if (!inputJob?.jobID) {
    endEditSession();
    return;
  }

  if (!findJobInJobArray(inputJob.jobID)) {
    showSnackbarWarning(
      "This job was removed while you had it open, so your changes were not saved.",
      8,
    );
    endEditSession();
    return;
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

  if (inputJob.includedInGroup) {
    const matchedGroup = getGroupObject(inputJob.groupID);
    if (matchedGroup) {
      matchedGroup.addJobsToGroup(Object.values(tempJobsSource));
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

  const groupID = inputJob.includedInGroup ? inputJob.groupID : null;
  const persistToServer =
    isLoggedIn && canPersistJobClose(inputJob.jobID, groupID);

  const jobsToPersist = [
    inputJob,
    ...Object.values(tempJobsSource),
    ...batchUpdates,
  ];

  let saveRefused = false;
  if (persistToServer) {
    const outcome = await saveJobsViaApi(
      jobsToPersist,
      changesToEditedJob?.length
        ? { [inputJob.jobID]: changesToEditedJob }
        : undefined,
    );
    saveRefused =
      outcome === "conflict" || outcome === "locked" || outcome === "failed";
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
    if (!saveRefused) {
      showSnackbarInfo(closeAdjustmentSummary(inputJob, adjustments), 5);
    }
    return;
  }
  if (isLoggedIn) {
    showSnackbarWarning(
      "You do not hold the lock on this job, so your changes were not saved.",
      8,
    );
  }
}

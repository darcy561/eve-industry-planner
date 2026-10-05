import {
  totalQuantityProduced,
  childJobIDs,
  parentJobIDs,
} from "../../../Components/Edit Job/Edit Job Hooks/jobSelectors";
import applyParentChildChanges from "../../../Components/Edit Job/functions/applyParentChildChanges";
import repairMissingParentChildRelationships from "../../Shared/repairParentChildRelationships";
import normaliseParentChildRelationships from "../../Shared/normaliseParentChildRelationships.js";
import materialTreeShaker from "../../Helper/materialTreeShaker";
import getAllRelatedJobs from "../../Helper/getAllRelatedJobs";
import { canPersistJobClose } from "../../DocumentLock/canPersistDocumentEditClose.js";
import { saveJobsAsOneChange } from "../sync/saveJobsViaApi.js";
import { restoreSavedJobs } from "../sync/persistJobDocumentsToApi.js";
import { openChangeReview } from "../../../Events/changeReviewEvents";
import { nothingChangedMessage } from "../changes/jobChange.js";
import {
  showSnackbarInfo,
  showSnackbarWarning,
} from "../../../Events/snackbarEvents";
import useUsersStore from "../../../Zustand/usersStore";
import { copyOfJob } from "../jobDocument";
import { endEditSession } from "./editSessionLifetime.js";
import { saveUserAccountDocument } from "../../Endpoints/Private/userDocument";
import recalculateJobForNewTotal from "../setups/recalculateJobForNewTotal";
import { formatNumberForLocale } from "../../Helper/numberParser";

/**
 * Saves the job being edited with every job its close links, repairs or resizes, and ends the edit;
 * a refused save keeps the editor open on the saved copies and the reader's changes.
 *
 * @returns {Promise<"closed"|"kept-open">}
 */
export async function closeActiveJob(
  jobToSave,
  jobModifiedFlag,
  tempJobsToAdd,
  esiDataToLink,
  parentChildToEdit,
  queryClient,
  changesToEditedJob,
) {
  const inputJob = copyOfJob(jobToSave);

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
      if (outcome === "locked") {
        showSnackbarWarning(
          `${nothingChangedMessage("saved", { outcome })} Your changes are still open.`,
          8,
        );
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

/**
 * What to tell someone when closing a job changed it, or the jobs around it.
 *
 * @param {object} job - The job being closed
 * @param {Array<{jobID: string, name: string, before: number, after: number}>} adjustments
 *   Jobs the close recalculated, and what they produced before and after
 * @returns {string} Snackbar text
 */
export function closeAdjustmentSummary(job, adjustments = []) {
  const name = job?.name || "Job";
  if (adjustments.length === 0) return `${name} Updated`;

  const own = adjustments.find(({ jobID }) => jobID === job?.jobID);
  const parentIDs = new Set(parentJobIDs(job));
  const childIDs = new Set(childJobIDs(job));

  let parents = 0;
  let children = 0;
  let others = 0;
  for (const { jobID } of adjustments) {
    if (jobID === job?.jobID) continue;
    if (parentIDs.has(jobID)) parents++;
    else if (childIDs.has(jobID)) children++;
    else others++;
  }

  const parts = [];
  if (own) {
    const produced = formatNumberForLocale(own.after, { max: 0 });
    parts.push(
      parentIDs.size > 0
        ? `now making ${produced} to cover its parent jobs`
        : `now making ${produced}`,
    );
  }
  if (parents > 0) parts.push(`${count(parents, "parent job")} adjusted`);
  if (children > 0) parts.push(`${count(children, "child job")} adjusted`);
  if (others > 0) parts.push(`${count(others, "related job")} adjusted`);

  return `${name} updated — ${joinParts(parts)}`;
}

/** @param {number} n @param {string} noun */
function count(n, noun) {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

/** @param {string[]} parts */
function joinParts(parts) {
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

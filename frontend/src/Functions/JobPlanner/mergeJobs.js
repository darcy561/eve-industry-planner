import useUsersStore from "../../Zustand/usersStore";
import Job from "../../Classes/job";
import {
  putJobDocumentsBatch,
  deleteJobDocumentsFromApi,
} from "../Endpoints/Pirivate/jobDocuments.js";
import normalizeParentChildRelationships from "../Shared/normalizeParentChildRelationships.js";
import { showSnackbarError, showSnackbarSuccess } from "../../Events/snackbarEvents";

/**
 * Merges duplicate jobs (same itemID) into replacement jobs.
 *
 * Notes:
 * - Only selected jobs are candidates for merge.
 * - Relationship normalization is scoped to touched jobs only, so links to jobs
 *   outside the touched set are preserved as-is.
 *
 * @param {string[]|Set<string>|string} inputJobIDs
 * @param {{ buildJob: Function }} options
 * @returns {Promise<{ mergedCount: number, mergedGroups: number, removedJobIDs: string[] }>}
 */
export default async function mergeJobs(inputJobIDs, options = {}) {
  const { buildJob } = options;
  if (typeof buildJob !== "function") {
    throw new Error("mergeJobs requires options.buildJob");
  }

  const {
    findJobInJobArray,
    mergeAndRemoveJobsFromJobArray,
    updateOrAddJobsToJobArray,
  } = useUsersStore.getState().jobData.actions;
  const { isLoggedIn } = useUsersStore.getState().account;
  const { addLinkedEsiData } = useUsersStore.getState().account.actions;

  const normalizedInput = Array.isArray(inputJobIDs)
    ? inputJobIDs
    : inputJobIDs instanceof Set
      ? [...inputJobIDs]
      : [inputJobIDs];
  const selectedIDs = [...new Set(normalizedInput.filter(Boolean))];

  const selectedJobs = selectedIDs
    .map((id) => findJobInJobArray(id))
    .filter(Boolean);

  const jobsByTypeID = new Map();
  for (const job of selectedJobs) {
    if (!jobsByTypeID.has(job.itemID)) {
      jobsByTypeID.set(job.itemID, []);
    }
    jobsByTypeID.get(job.itemID).push(job);
  }

  const mergeGroups = [...jobsByTypeID.values()].filter((jobs) => jobs.length > 1);
  if (mergeGroups.length === 0) {
    showSnackbarSuccess("0 Jobs Merged", 3);
    return { mergedCount: 0, mergedGroups: 0, removedJobIDs: [] };
  }

  const touchedJobs = new Set();
  const replacementJobs = [];
  const replacementJobsByID = new Map();
  const workingJobsByID = new Map();
  const mergeRecords = [];

  for (const group of mergeGroups) {
    const parentJobs = new Set();
    const childJobsByType = new Map();
    let totalItemQuantity = 0;

    for (const job of group) {
      totalItemQuantity += job.build?.products?.totalQuantity ?? 0;

      for (const parentID of job.parentJobs ?? []) {
        parentJobs.add(parentID);
      }

      for (const material of job.build?.materials ?? []) {
        const typeID = material.typeID;
        if (!childJobsByType.has(typeID)) {
          childJobsByType.set(typeID, new Set());
        }
        for (const childID of job.build?.childJobs?.[typeID] ?? []) {
          childJobsByType.get(typeID).add(childID);
        }
      }
    }

    const newJob = await buildJob({
      itemID: group[0].itemID,
      itemQty: totalItemQuantity,
      parentJobs: [...parentJobs],
      childJobs: [...childJobsByType.entries()].map(([typeID, childJobs]) => ({
        typeID,
        childJobs: [...childJobs],
      })),
    });

    if (!newJob?.jobID) {
      continue;
    }

    replacementJobs.push(newJob);
    replacementJobsByID.set(newJob.jobID, newJob);
    touchedJobs.add(newJob);
    mergeRecords.push({
      itemID: group[0].itemID,
      oldJobIDs: new Set(group.map((job) => job.jobID)),
      parentJobs: new Set(parentJobs),
      childJobsByType,
      newJob,
    });
  }

  if (replacementJobs.length === 0) {
    showSnackbarSuccess("0 Jobs Merged", 3);
    return { mergedCount: 0, mergedGroups: 0, removedJobIDs: [] };
  }

  const oldJobIDsToRemove = new Set(
    mergeRecords.flatMap((record) => [...record.oldJobIDs])
  );

  const oldToNew = new Map();
  for (const record of mergeRecords) {
    for (const oldID of record.oldJobIDs) {
      oldToNew.set(oldID, record.newJob.jobID);
    }
  }

  const resolveCurrentJobID = (jobID) => oldToNew.get(jobID) ?? jobID;
  const getWorkingJobByID = (jobID) => {
    if (workingJobsByID.has(jobID)) {
      return workingJobsByID.get(jobID);
    }
    const sourceJob = findJobInJobArray(jobID);
    if (!sourceJob) {
      return null;
    }
    const clonedJob = new Job(sourceJob.toDocument());
    workingJobsByID.set(jobID, clonedJob);
    return clonedJob;
  };
  const resolveJobObject = (jobID) =>
    replacementJobsByID.get(resolveCurrentJobID(jobID)) ??
    getWorkingJobByID(resolveCurrentJobID(jobID));

  for (const record of mergeRecords) {
    const oldIDs = [...record.oldJobIDs];
    const replacementJob = record.newJob;

    replacementJob.parentJobs = [
      ...new Set(
        (replacementJob.parentJobs ?? [])
          .map(resolveCurrentJobID)
          .filter((id) => id !== replacementJob.jobID)
      ),
    ];

    for (const material of replacementJob.build?.materials ?? []) {
      const typeID = material.typeID;
      const translatedChildren = (replacementJob.build?.childJobs?.[typeID] ?? [])
        .map(resolveCurrentJobID)
        .filter((id) => id !== replacementJob.jobID);
      replacementJob.build.childJobs[typeID] = [...new Set(translatedChildren)];
    }

    for (const parentID of record.parentJobs) {
      const parentJob = resolveJobObject(parentID);
      if (!parentJob || parentJob.jobID === replacementJob.jobID) continue;
      parentJob.removeChildJob(record.itemID, oldIDs);
      parentJob.addChildJob(record.itemID, replacementJob.jobID);
      touchedJobs.add(parentJob);
    }

    for (const childIDs of record.childJobsByType.values()) {
      for (const childID of childIDs) {
        const childJob = resolveJobObject(childID);
        if (!childJob || childJob.jobID === replacementJob.jobID) continue;
        childJob.removeParentJob(oldIDs);
        childJob.addParentJob(replacementJob.jobID);
        touchedJobs.add(childJob);
      }
    }
  }

  normalizeParentChildRelationships([...touchedJobs]);

  const jobsToPersist = [...touchedJobs].filter(
    (job) => !oldJobIDsToRemove.has(job.jobID)
  );

  const linkedJobIdsToRemove = new Set();
  const linkedOrderIdsToRemove = new Set();
  const linkedTransIdsToRemove = new Set();

  for (const oldJobID of oldJobIDsToRemove) {
    const oldJob = findJobInJobArray(oldJobID);
    if (!oldJob) continue;
    for (const id of oldJob.apiJobs ?? []) linkedJobIdsToRemove.add(id);
    for (const id of oldJob.apiOrders ?? []) linkedOrderIdsToRemove.add(id);
    for (const id of oldJob.apiTransactions ?? []) linkedTransIdsToRemove.add(id);
  }

  if (isLoggedIn) {
    try {
      await putJobDocumentsBatch(jobsToPersist);
      await deleteJobDocumentsFromApi([...oldJobIDsToRemove]);
    } catch (err) {
      console.error("mergeJobs: failed to persist merge", err);
      showSnackbarError("Unable to save merged jobs. No jobs were removed.", 5);
      throw err;
    }
  }

  mergeAndRemoveJobsFromJobArray(replacementJobs, [...oldJobIDsToRemove]);
  updateOrAddJobsToJobArray([...workingJobsByID.values()]);

  addLinkedEsiData({
    ordersToRemove: linkedOrderIdsToRemove,
    jobsToRemove: linkedJobIdsToRemove,
    transactionsToRemove: linkedTransIdsToRemove,
  });

  showSnackbarSuccess(`${replacementJobs.length} Jobs Merged Successfully`, 3);
  return {
    mergedCount: replacementJobs.length,
    mergedGroups: mergeRecords.length,
    removedJobIDs: [...oldJobIDsToRemove],
  };
}

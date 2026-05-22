import Job from "../../Classes/job";
import Group from "../../Classes/group";
import {
  deleteJobDocumentsFromApi,
  putJobDocumentsBatch,
} from "../Endpoints/Pirivate/jobDocuments.js";
import { putJobGroupsBatch } from "../Endpoints/Pirivate/groups.js";
import { showSnackbarError } from "../../Events/snackbarEvents";
import useUsersStore from "../../Zustand/usersStore";
import { saveUserAccountDocument } from "../Endpoints/Pirivate/userDocument";

/**
 * Deletes one or more jobs with clone-on-write safety and strict persistence ordering.
 *
 * Flow:
 * - Normalizes input IDs and resolves existing jobs.
 * - Rewrites parent/child links on cloned related jobs only.
 * - Recomputes touched groups once per group using a post-delete effective job array.
 * - (Logged-in) Persists changed job docs, changed group docs, account linked-ESI data, then
 *   deletes target job docs from the API.
 * - Commits local store updates only after persistence succeeds.
 *
 * If any logged-in persistence step fails, local linked-ESI account sets are restored from
 * snapshot and no local delete commit is applied.
 *
 * @param {string|Array<string>|Set<string>} inputJobIDs - Job ID(s) to delete
 * @returns {Promise<void>} Promise that resolves when deletion is complete
 *
 * @example
 * await deleteMultipleJobs("job_123");
 *
 * @example
 * await deleteMultipleJobs(["job_123", "job_456", "job_789"]);
 */
export default async function deleteMultipleJobs(inputJobIDs) {
  const { groupArray, jobArray } = useUsersStore.getState().jobData;
  const {
    updateModifiedGroups,
    removeFromMultiSelect,
    removeJobsFromJobArray,
    updateOrAddJobsToJobArray,
  } = useUsersStore.getState().jobData.actions;
  const isLoggedIn = useUsersStore.getState().account.isLoggedIn;
  const linkedJobIdsToRemove = new Set();
  const linkedOrderIdsToRemove = new Set();
  const linkedTransIdsToRemove = new Set();
  const jobsToSave = new Set();
  const touchedGroupIDs = new Set();
  const normalizedInputIDs = Array.isArray(inputJobIDs)
    ? inputJobIDs
    : inputJobIDs instanceof Set
      ? [...inputJobIDs]
      : [inputJobIDs];
  const selectedJobIDs = [...new Set(normalizedInputIDs.filter(Boolean))];
  const selectedJobIDSet = new Set(selectedJobIDs);

  const findJobInJobArray = useUsersStore.getState().jobData.actions.findJobInJobArray;
  const jobsToDelete = selectedJobIDs
    .map((jobID) => findJobInJobArray(jobID))
    .filter(Boolean);

  if (jobsToDelete.length === 0) {
    showSnackbarError("0 Job/Jobs Deleted", 3);
    return;
  }

  const jobsToDeleteIDs = jobsToDelete.map(({ jobID }) => jobID);
  const workingJobsByID = new Map();
  const workingGroupsByID = new Map();
  const jobsToDeleteByGroupID = new Map();
  const getWorkingJob = (jobID) => {
    if (workingJobsByID.has(jobID)) {
      return workingJobsByID.get(jobID);
    }
    const source = findJobInJobArray(jobID);
    if (!source) {
      return null;
    }
    const cloned = new Job(source.toDocument());
    workingJobsByID.set(jobID, cloned);
    return cloned;
  };
  const getWorkingGroup = (groupID) => {
    if (workingGroupsByID.has(groupID)) {
      return workingGroupsByID.get(groupID);
    }
    const source = groupArray.find((group) => group.groupID === groupID);
    if (!source) {
      return null;
    }
    const cloned = new Group(source.toDocument());
    workingGroupsByID.set(groupID, cloned);
    return cloned;
  };
  const getEffectiveJobArray = () =>
    jobArray.map((job) => workingJobsByID.get(job.jobID) ?? job);

  for (const inputJob of jobsToDelete) {
    inputJob.apiJobs.forEach((jobID) => linkedJobIdsToRemove.add(jobID));
    inputJob.apiOrders.forEach((orderID) => linkedOrderIdsToRemove.add(orderID));
    inputJob.apiTransactions.forEach((transactionID) =>
      linkedTransIdsToRemove.add(transactionID)
    );

    // Removes deleted job IDs from child jobs.
    for (const mat of inputJob.build.materials ?? []) {
      for (const jobID of inputJob.build.childJobs?.[mat.typeID] ?? []) {
        if (selectedJobIDSet.has(jobID)) continue;
        const child = getWorkingJob(jobID);
        if (!child) continue;
        child.removeParentJob(inputJob.jobID);
        jobsToSave.add(child.jobID);
      }
    }

    // Removes deleted job IDs from parent jobs (canonical `parentJobs`; legacy `parentJob` from Firestore).
    const rawParents = inputJob.parentJobs ?? inputJob.parentJob;
    const parentJobIds = Array.isArray(rawParents)
      ? rawParents
      : rawParents != null
        ? [rawParents]
        : [];
    for (const parentJobID of parentJobIds) {
      if (selectedJobIDSet.has(parentJobID)) continue;
      const parentJob = getWorkingJob(parentJobID);
      if (!parentJob || !parentJob.build.childJobs[inputJob.itemID]) continue;
      parentJob.removeChildJob(inputJob.itemID, inputJob.jobID);
      jobsToSave.add(parentJob.jobID);
    }

    if (inputJob.groupID) {
      if (!jobsToDeleteByGroupID.has(inputJob.groupID)) {
        jobsToDeleteByGroupID.set(inputJob.groupID, []);
      }
      jobsToDeleteByGroupID.get(inputJob.groupID).push(inputJob);
    }
  }

  const effectiveJobArrayWithoutDeleted = getEffectiveJobArray().filter(
    (job) => !selectedJobIDSet.has(job.jobID)
  );
  for (const [groupID, groupJobsToDelete] of jobsToDeleteByGroupID.entries()) {
    removeJobsFromGroup(groupID, groupJobsToDelete, effectiveJobArrayWithoutDeleted);
  }

  const requiresUserAccountSave =
    linkedOrderIdsToRemove.size > 0 ||
    linkedJobIdsToRemove.size > 0 ||
    linkedTransIdsToRemove.size > 0;
  const linkedEsiRemovalPatch = {
    ordersToRemove: linkedOrderIdsToRemove,
    jobsToRemove: linkedJobIdsToRemove,
    transactionsToRemove: linkedTransIdsToRemove,
  };

  const jobsToPersist = [...jobsToSave]
    .map((jobID) => workingJobsByID.get(jobID))
    .filter(Boolean);
  const groupsToPersist = [...touchedGroupIDs]
    .map((groupID) => workingGroupsByID.get(groupID))
    .filter(Boolean);

  if (isLoggedIn) {
    const accountSnapshot = {
      linkedOrders: new Set(useUsersStore.getState().account.linkedOrders ?? []),
      linkedJobs: new Set(useUsersStore.getState().account.linkedJobs ?? []),
      linkedTrans: new Set(useUsersStore.getState().account.linkedTrans ?? []),
    };
    useUsersStore.getState().account.actions.addLinkedEsiData(linkedEsiRemovalPatch);
    try {
      if (jobsToPersist.length > 0) {
        await putJobDocumentsBatch(jobsToPersist);
      }
      if (groupsToPersist.length > 0) {
        await putJobGroupsBatch(groupsToPersist.map((group) => group.toDocument()));
      }
      if (requiresUserAccountSave) {
        await saveUserAccountDocument();
      }
      await deleteJobDocumentsFromApi(jobsToDeleteIDs);
    } catch (err) {
      restoreLinkedEsiSnapshot(accountSnapshot);
      console.error("deleteMultipleJobs: failed to persist delete flow", err);
      const rateLimited =
        err?.status === 429 ||
        (typeof err?.message === "string" && err.message.includes("429"));
      showSnackbarError(
        rateLimited
          ? "Too many requests — wait a moment and try again."
          : "Unable to delete jobs. No jobs were removed.",
        5
      );
      throw err;
    }
  }

  if (groupsToPersist.length > 0) {
    updateModifiedGroups(groupsToPersist);
  }
  if (jobsToPersist.length > 0) {
    updateOrAddJobsToJobArray(jobsToPersist);
  }
  removeJobsFromJobArray(jobsToDeleteIDs);
  removeFromMultiSelect(jobsToDeleteIDs);

  if (!isLoggedIn && requiresUserAccountSave) {
    useUsersStore.getState().account.actions.addLinkedEsiData(linkedEsiRemovalPatch);
  }

  showSnackbarError(`${jobsToDeleteIDs.length} Job/Jobs Deleted`, 3);

  /**
   * Applies a batched group delete update on a cloned group object.
   *
   * @param {string} groupID
   * @param {Array<object>} jobsInGroupToDelete
   * @param {Array<object>} effectiveJobArray
   * @private
   */
  function removeJobsFromGroup(groupID, jobsInGroupToDelete, effectiveJobArray) {
    if (!groupID || !jobsInGroupToDelete || jobsInGroupToDelete.length === 0) return;
    const group = getWorkingGroup(groupID);
    if (!group) return;
    group.removeJobsFromGroup(jobsInGroupToDelete, effectiveJobArray);
    touchedGroupIDs.add(groupID);
  }

  /**
   * Restores `account.linkedOrders/linkedJobs/linkedTrans` to a prior snapshot.
   * Used when logged-in delete persistence fails after local linked-ESI staging.
   *
   * @param {{ linkedOrders: Set<number>, linkedJobs: Set<number>, linkedTrans: Set<number> }} snapshot
   * @private
   */
  function restoreLinkedEsiSnapshot(snapshot) {
    if (!snapshot) return;
    const current = useUsersStore.getState().account;
    const ordersToAdd = [...snapshot.linkedOrders].filter(
      (id) => !current.linkedOrders.has(id)
    );
    const jobsToAdd = [...snapshot.linkedJobs].filter(
      (id) => !current.linkedJobs.has(id)
    );
    const transactionsToAdd = [...snapshot.linkedTrans].filter(
      (id) => !current.linkedTrans.has(id)
    );
    const ordersToRemove = [...current.linkedOrders].filter(
      (id) => !snapshot.linkedOrders.has(id)
    );
    const jobsToRemove = [...current.linkedJobs].filter(
      (id) => !snapshot.linkedJobs.has(id)
    );
    const transactionsToRemove = [...current.linkedTrans].filter(
      (id) => !snapshot.linkedTrans.has(id)
    );

    useUsersStore.getState().account.actions.addLinkedEsiData({
      ...(ordersToAdd.length > 0 ? { ordersToAdd } : {}),
      ...(jobsToAdd.length > 0 ? { jobsToAdd } : {}),
      ...(transactionsToAdd.length > 0 ? { transactionsToAdd } : {}),
      ...(ordersToRemove.length > 0 ? { ordersToRemove } : {}),
      ...(jobsToRemove.length > 0 ? { jobsToRemove } : {}),
      ...(transactionsToRemove.length > 0 ? { transactionsToRemove } : {}),
    });
  }
}

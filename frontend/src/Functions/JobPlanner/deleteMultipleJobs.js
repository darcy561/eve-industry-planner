import { getAnalytics, logEvent } from "firebase/analytics";
import { trace } from "firebase/performance";
import { performance } from "../../firebase";
import uploadGroupsToFirebase from "../Firebase/uploadGroupData";
import uploadJobSnapshotsToFirebase from "../Firebase/uploadJobSnapshots";
import findOrGetJobObject from "../Helper/findJobObject";
import manageListenerRequests from "../Firebase/manageListenerRequests";
import firebaseBatchUpdateJobs from "../Firebase/batchUpdateJobs";
import firebaseBatchDeleteJobs from "../Firebase/batchDeleteJobs";
import { showSnackbarError } from "../../Events/snackbarEvents";
import useUsersStore from "../../Zustand/usersStore";
import uploadApplicationSettingsToFirebase from "../Firebase/uploadApplicationSettings";

/**
 * Deletes multiple jobs and handles all related cleanup operations.
 * Removes parent-child relationships, updates groups, cleans up Firebase listeners,
 * and handles linked ESI data (orders, jobs, transactions).
 *
 * @param {string|Array<string>} inputJobIDs - Job ID(s) to delete
 * @returns {Promise<void>} Promise that resolves when deletion is complete
 *
 * @example
 * await deleteMultipleJobs("job_123");
 *
 * @example
 * await deleteMultipleJobs(["job_123", "job_456", "job_789"]);
 */
export default async function deleteMultipleJobs(inputJobIDs) {
  const { groupArray, userJobSnapshot, jobArray } =
    useUsersStore.getState().jobData;
  const {
    replaceGroupArray,
    removeJobsFromUserJobSnapshotArray,
    removeFromMultiSelect,
    findJobInUserJobSnapshotArray,
    mergeAndRemoveJobsFromJobArray,
  } = useUsersStore.getState().jobData.actions;
  const isLoggedIn = useUsersStore.getState().users.isLoggedIn;
  const firebaseListeners = useUsersStore.getState().users.firebaseListeners;
  const removeFirebaseListeners =
    useUsersStore.getState().users.actions.removeFirebaseListeners;

  const analytics = getAnalytics();
  const parentUser = useUsersStore.getState().users.actions.findParentUser();

  const r = trace(performance, "massDeleteProcess");
  r.start();
  const retrievedJobs = [];
  const batchJobsToDelete = [];
  let newGroupArray = [...groupArray];
  let linkedJobIdsToRemove = new Set();
  let linkedOrderIdsToRemove = new Set();
  let linkedTransIdsToRemove = new Set();
  let jobsToSave = new Set();

  if (!Array.isArray(inputJobIDs)) {
    inputJobIDs = [inputJobIDs];
  }

  logEvent(analytics, "Mass Delete", {
    UID: parentUser.accountID,
    buildCount: inputJobIDs.length,
    loggedIn: isLoggedIn,
  });

  for (let inputJobID of inputJobIDs) {
    let inputJob = await findOrGetJobObject(inputJobID, retrievedJobs);

    if (!inputJob) {
      continue;
    }

    inputJob.apiJobs.forEach((job) => {
      linkedJobIdsToRemove.add(job);
    });
    inputJob.apiOrders.forEach((order) => {
      linkedOrderIdsToRemove.add(order);
    });

    inputJob.apiTransactions.forEach((trans) => {
      linkedTransIdsToRemove.add(trans);
    });

    //Removes inputJob IDs from child jobs
    for (let mat of inputJob.build.materials) {
      if (!mat) {
        continue;
      }
      for (let jobID of inputJob.build.childJobs[mat.typeID]) {
        if (inputJobIDs.includes(jobID)) continue;
        let child = await findOrGetJobObject(jobID, retrievedJobs);

        if (!child) {
          continue;
        }
        child.removeParentJob(inputJob.jobID);

        jobsToSave.add(child.jobID);
      }
    }
    //Removes inputJob IDs from Parent jobs
    if (inputJob.parentJob !== null) {
      for (let parentJobID of inputJob.parentJob) {
        if (inputJobIDs.includes(parentJobID)) continue;
        let parentJob = await findOrGetJobObject(parentJobID, retrievedJobs);

        if (!parentJob || !parentJob.build.childJobs[inputJob.itemID]) {
          continue;
        }

        parentJob.removeChildJob(inputJob.itemID, inputJob.jobID);

        const matchedSnapshot = findJobInUserJobSnapshotArray(parentJob.jobID);
        if (matchedSnapshot) {
          matchedSnapshot.setSnapshot(parentJob);
        }

        jobsToSave.add(parentJob.jobID);
      }
    }

    removeJobFromGroup(inputJob);

    if (isLoggedIn) {
      const listener = firebaseListeners.find((i) => i.id === inputJob.jobID);
      if (listener) {
        listener.unsubscribe();
      }
      batchJobsToDelete.push(inputJob);
    }
  }

  const requiresApplicationSettingsSave =
    linkedOrderIdsToRemove.size > 0 ||
    linkedJobIdsToRemove.size > 0 ||
    linkedTransIdsToRemove.size > 0;

  useUsersStore.getState().users.actions.addLinkedEsiData({
    ordersToRemove: linkedOrderIdsToRemove,
    jobsToRemove: linkedJobIdsToRemove,
    transactionsToRemove: linkedTransIdsToRemove,
  });

  manageListenerRequests(
    retrievedJobs.filter(({ id }) => !inputJobIDs.includes(id))
  );

  replaceGroupArray(newGroupArray);
  removeJobsFromUserJobSnapshotArray(inputJobIDs);
  mergeAndRemoveJobsFromJobArray(retrievedJobs, inputJobIDs);
  removeFromMultiSelect(inputJobIDs);

  if (isLoggedIn) {
    const batchJobsToSave = [];
    for (const jobID of [...jobsToSave]) {
      let job = [...jobArray, ...retrievedJobs].find((i) => i.jobID === jobID);
      if (!job) {
        continue;
      }
      batchJobsToSave.push(job);
    }

    const promises = [
      firebaseBatchDeleteJobs(batchJobsToDelete),
      firebaseBatchUpdateJobs(batchJobsToSave),
      uploadGroupsToFirebase(),
      uploadJobSnapshotsToFirebase(
        userJobSnapshot.filter((i) => !inputJobIDs.includes(i.jobID))
      ),
    ];
    
    if (requiresApplicationSettingsSave) {
      promises.push(uploadApplicationSettingsToFirebase());
    }

    removeFirebaseListeners(batchJobsToDelete.map(({ jobID }) => jobID));

    await Promise.all(promises);
  }

  showSnackbarError(`${inputJobIDs.length} Job/Jobs Deleted`, 3);
  r.stop();

  /**
   * Removes a job from its associated group.
   *
   * @param {Object} inputJob - Job object to remove from group
   * @returns {Array} Updated group array
   *
   * @private
   */
  function removeJobFromGroup(inputJob) {
    if (!inputJob) return newGroupArray;

    if (!inputJob.groupID) return;

    const group = newGroupArray.find((i) => i.groupID === inputJob.groupID);

    if (!group) return newGroupArray;

    group.removeJobsFromGroup(inputJob, [...jobArray, ...retrievedJobs]);
  }
}

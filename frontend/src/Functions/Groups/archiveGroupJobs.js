import {
  esiJobIDs,
  esiOrderIDs,
  esiTransactionIDs,
} from "../../Components/Edit Job/Edit Job Hooks/jobSelectors";
import { flushPendingGroupSave } from "../Debounce/jobGroupsPersistSchedule.js";
import saveArchivedJobs from "../Endpoints/Private/archivedJobs.js";
import {
  showSnackbarError,
  showSnackbarSuccess,
} from "../../Events/snackbarEvents.js";
import { saveUserAccountDocument } from "../Endpoints/Private/userDocument.js";
import { deleteJobGroupsFromApi } from "../Endpoints/Private/groups.js";
import { deleteJobDocumentsFromApi } from "../Endpoints/Private/jobDocuments.js";
import useUsersStore from "../../Zustand/usersStore.js";

/**
 * Archives selected jobs from the active group. Reads job/account state from Zustand.
 *
 * @param {Array} selectedJobs
 * @returns {Promise<boolean>} `true` when jobs were archived on the server (caller may invalidate statistics queries); `false` otherwise.
 */
export async function archiveGroupJobs(selectedJobs) {
  const { jobData, account } = useUsersStore.getState();
  const {
    clearActiveGroupID,
    removeGroupFromGroupArray,
    removeJobsFromJobArray,
    getActiveGroupObject,
  } = jobData.actions;

  const activeGroup = getActiveGroupObject();
  if (!activeGroup) {
    showSnackbarError("No active group to archive.", 3);
    return false;
  }
  const { groupID, groupName } = activeGroup;

  const jobArray = jobData.jobArray;
  const isLoggedIn = account.isLoggedIn;

  let newLinkedOrders = new Set();
  let newLinkedTrans = new Set();
  let newLinkedJobs = new Set();

  const filteredJobs = selectedJobs.filter(
    (job) => !jobArray.find((j) => j.jobID === job.jobID && j.displayOnPlanner),
  );

  // A job's own ESI rows, not the account's ledger of them: `linkedTrans` and
  // `linkedJobs` are account fields, and reading them off a job released
  // nothing, leaving every archived job's runs and sales spoken for forever.
  for (const selectedJob of filteredJobs) {
    for (const orderID of esiOrderIDs(selectedJob)) {
      newLinkedOrders.add(orderID);
    }
    for (const transactionID of esiTransactionIDs(selectedJob)) {
      newLinkedTrans.add(transactionID);
    }
    for (const jobID of esiJobIDs(selectedJob)) {
      newLinkedJobs.add(jobID);
    }
  }

  // Only the jobs that were archived leave the planner. A job kept back stays
  // visible, still naming the group it came from.
  const removeIds = new Set(filteredJobs.map((j) => j.jobID));
  const linkedEsiPatch = {
    ordersToAdd: new Set(),
    jobsToAdd: new Set(),
    transactionsToAdd: new Set(),
    ordersToRemove: newLinkedOrders,
    jobsToRemove: newLinkedJobs,
    transactionsToRemove: newLinkedTrans,
  };

  if (!isLoggedIn) {
    useUsersStore.getState().account.actions.addLinkedEsiData(linkedEsiPatch);
    clearActiveGroupID();
    removeGroupFromGroupArray(groupID);
    removeJobsFromJobArray([...removeIds]);
    showSnackbarSuccess(`${groupName} Archived`, 3);
    return false;
  }

  const archivedOk = await saveArchivedJobs(filteredJobs);
  if (!archivedOk) {
    showSnackbarError("Some jobs could not be archived on the server.", 5);
    return false;
  }

  try {
    await deleteJobGroupsFromApi([groupID]);
  } catch (err) {
    const status = /** @type {{ status?: number }} */ (err)?.status;
    if (status === 409) {
      showSnackbarError(
        "Cannot archive: another session holds the edit lock for this group.",
        5,
      );
      return false;
    }
    console.error(err);
    showSnackbarError(
      "Could not remove the group on the server after archiving jobs.",
      5,
    );
    return false;
  }

  useUsersStore.getState().account.actions.addLinkedEsiData(linkedEsiPatch);
  clearActiveGroupID();
  removeGroupFromGroupArray(groupID);
  removeJobsFromJobArray([...removeIds]);

  await Promise.all([
    deleteJobDocumentsFromApi(filteredJobs.map((j) => j.jobID)),
    flushPendingGroupSave(),
    saveUserAccountDocument(),
  ]);

  showSnackbarSuccess(`${groupName} Archived`, 3);
  return true;
}

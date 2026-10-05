import { flushPendingGroupSave } from "../Debounce/jobGroupsPersistSchedule.js";
import { flushPendingJobDocumentsSave } from "../Debounce/jobDocumentsPersistSchedule.js";
import {
  showSnackbarError,
  showSnackbarSuccess,
  showSnackbarWarning,
} from "../../Events/snackbarEvents.js";
import { deleteJobGroupsFromApi } from "../Endpoints/Private/groups.js";
import {
  archiveJobsOnServer,
  nothingChangedMessage,
  releaseEsiLinksOf,
} from "../Job/changes/jobChange.js";
import { selectDocumentLockReadOnly } from "../DocumentLock/documentLockSelectors.js";
import { USER_JOB_GROUPS_COLLECTION } from "../DocumentLock/documentLockCollections.js";
import useUsersStore from "../../Zustand/usersStore.js";

/**
 * Archives the active group's jobs that are not shown on the planner and removes the group, moving the
 * jobs in one request that lands whole or not at all.
 *
 * @param {Array} selectedJobs
 * @returns {Promise<boolean>} Whether jobs were archived on the server, so statistics queries are stale
 */
export async function archiveGroupJobs(selectedJobs) {
  const { jobData, account } = useUsersStore.getState();
  const {
    clearActiveGroupID,
    removeGroupFromGroupArray,
    removeJobsFromJobArray,
    getActiveGroupObject,
    clearPendingJobDocumentWrites,
  } = jobData.actions;

  const activeGroup = getActiveGroupObject();
  if (!activeGroup) {
    showSnackbarError("No active group to archive.", 3);
    return false;
  }
  const { groupID, groupName } = activeGroup;
  const isLoggedIn = account.isLoggedIn;

  if (
    selectDocumentLockReadOnly(
      useUsersStore.getState(),
      USER_JOB_GROUPS_COLLECTION,
      groupID,
    )
  ) {
    showSnackbarWarning(
      nothingChangedMessage("archived", {
        because: "another member is editing this group",
      }),
      8,
    );
    return false;
  }

  if (isLoggedIn) {
    await flushPendingJobDocumentsSave();
  }
  const { findJobInJobArray } = useUsersStore.getState().jobData.actions;
  const archivedJobs = selectedJobs
    .map((job) => findJobInJobArray(job.jobID) ?? job)
    .filter((job) => !job.displayOnPlanner);
  const archivedIDs = archivedJobs.map((job) => job.jobID);

  if (isLoggedIn) {
    if (!(await archiveJobsOnServer(archivedJobs))) return false;
    clearPendingJobDocumentWrites(archivedIDs);
  }

  clearActiveGroupID();
  removeGroupFromGroupArray(groupID);
  removeJobsFromJobArray(archivedIDs);
  await releaseEsiLinksOf(archivedJobs, "archived");

  if (isLoggedIn) {
    try {
      await deleteJobGroupsFromApi([groupID]);
      await flushPendingGroupSave();
    } catch (err) {
      console.error(err);
      showSnackbarError(
        "The jobs were archived, but the group could not be removed. Reload to see it.",
        5,
      );
    }
  }

  showSnackbarSuccess(`${groupName} Archived`, 3);
  return isLoggedIn;
}

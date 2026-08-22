import { flushPendingGroupSave } from "../Debounce/jobGroupsPersistSchedule.js";
import { releaseJobsAfterGroupRemoved } from "./releaseJobsAfterGroupRemoved.js";
import {
  deleteJobGroupsFromApi,
  USER_JOB_GROUPS_COLLECTION,
} from "../Endpoints/Pirivate/groups.js";
import { getDocumentLockState } from "../Endpoints/Pirivate/documentLockClient.js";
import { showSnackbarError } from "../../Events/snackbarEvents.js";
import useUsersStore from "../../Zustand/usersStore.js";

/**
 * Deletes a group and returns jobs to normal planner snapshots (local + cloud when logged in).
 * When logged in, removes the `account_job_groups` document on the server first (respects doc locks).
 *
 * @param {string} inputGroupID
 */
export async function deleteGroupWithoutJobs(inputGroupID) {
  const isLoggedIn = useUsersStore.getState().account.isLoggedIn;
  const { getGroupObject, removeGroupFromGroupArray, clearActiveGroupIfMatches } =
    useUsersStore.getState().jobData.actions;

  const chosenGroup = getGroupObject(inputGroupID);
  if (!chosenGroup) return;

  if (isLoggedIn) {
    const lockRes = await getDocumentLockState(
      USER_JOB_GROUPS_COLLECTION,
      inputGroupID
    );
    if (lockRes.ok) {
      const lockBody = await lockRes.json().catch(() => ({}));
      if (lockBody.held) {
        const mySessionID = useUsersStore.getState().account.sessionID;
        if (
          lockBody.holderSessionID &&
          mySessionID &&
          lockBody.holderSessionID !== mySessionID
        ) {
          showSnackbarError(
            "Cannot delete this group: another session holds the edit lock.",
            5
          );
          return;
        }
        if (lockBody.holderSessionID && !mySessionID) {
          showSnackbarError(
            "Cannot delete this group: session identity is unavailable.",
            5
          );
          return;
        }
      }
    }

    try {
      await deleteJobGroupsFromApi([inputGroupID]);
    } catch (err) {
      const status = /** @type {{ status?: number }} */ (err)?.status;
      if (status === 409) {
        showSnackbarError(
          "Cannot delete this group: another session holds the edit lock.",
          5
        );
        return;
      }
      console.error(err);
      showSnackbarError("Could not delete the group on the server.", 5);
      return;
    }
  }

  await releaseJobsAfterGroupRemoved(chosenGroup);

  clearActiveGroupIfMatches(inputGroupID);
  removeGroupFromGroupArray(inputGroupID);

  if (isLoggedIn) {
    await flushPendingGroupSave();
  }
}

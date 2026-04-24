import useUsersStore from "../../Zustand/usersStore.js";
import { putJobGroupsBatch } from "../Endpoints/Pirivate/groups.js";

/**
 * Persists job groups to the API (`PUT /api/v1/groups`).
 * Only groups listed in `jobData.pendingJobGroupWrites` are sent so other clients get WS updates for those docs only.
 *
 *
 * @returns {Promise<void>}
 */
export async function persistJobGroupsToApi() {
  try {
    const isLoggedIn = useUsersStore.getState().account.isLoggedIn;
    if (!isLoggedIn) {
      return;
    }

    const { jobData } = useUsersStore.getState();
    const { getPendingJobGroupWritesPayload, clearPendingJobGroupWrites } =
      jobData.actions;
    const queuedIds = [...new Set(jobData.pendingJobGroupWrites ?? [])];
    if (queuedIds.length === 0) {
      return;
    }

    const groupObjects = getPendingJobGroupWritesPayload();
    if (groupObjects.length === 0) {
      clearPendingJobGroupWrites(queuedIds);
      return;
    }

    await putJobGroupsBatch(groupObjects);
    clearPendingJobGroupWrites(queuedIds);
  } catch (err) {
    console.error(`Error saving job groups to API ${err}`);
  }
}

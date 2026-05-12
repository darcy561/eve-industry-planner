import { useCallback } from "react";
import { MAX_STATUS_BATCH_DOC_IDS } from "../../Functions/Endpoints/Pirivate/documentLockClient.js";
import useUsersStore from "../../Zustand/usersStore.js";
import { PLANNER_PAGE_JOB_CHUNK_MAX } from "../../Functions/DocumentLock/documentLockTimings.js";
import { useLockScopeSync } from "./useLockScopeSync.js";

/** Stay below {@link MAX_STATUS_BATCH_DOC_IDS} per array; reserve slack for groups in the first chunk. */
const PLANNER_PAGE_JOB_CHUNK = Math.min(
  PLANNER_PAGE_JOB_CHUNK_MAX,
  MAX_STATUS_BATCH_DOC_IDS - 50
);

/**
 * Fetches lock state for all planner jobs **and groups** in one
 * `status-batch` call per chunk (Job Planner route only). Group rows ride
 * along on the first chunk; further chunks are jobs only.
 */
export function useJobPlannerPageLockSync() {
  const getJobIDs = useCallback(
    () => useUsersStore.getState().jobData.jobArray.map((j) => j.jobID),
    []
  );
  const getGroupIDs = useCallback(
    () =>
      useUsersStore.getState().jobData.groupArray.map((g) => g.groupID),
    []
  );
  useLockScopeSync({
    getJobIDs,
    getGroupIDs,
    trackGroups: true,
    chunkSize: PLANNER_PAGE_JOB_CHUNK,
  });
}

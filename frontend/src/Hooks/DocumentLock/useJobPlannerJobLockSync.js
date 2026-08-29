import { useCallback } from "react";
import { MAX_STATUS_BATCH_DOC_IDS } from "../../Functions/Endpoints/Private/documentLockClient.js";
import useUsersStore from "../../Zustand/usersStore.js";
import { useLockScopeSync } from "./useLockScopeSync.js";

// Re-export so existing imports keep working without forcing call sites to
// switch to the dedicated module.
export {
  patchPlannerGroupLockScopeFromApi,
  patchPlannerJobLockScopeFromApi,
} from "./plannerLockScopeFromApi.js";

/**
 * Job-only planner lock sync. Subscribes to jobArray changes and refreshes
 * every per-job document lock scope from the server in chunks bounded by
 * `MAX_STATUS_BATCH_DOC_IDS`. No groups — that's the page-level hook below.
 */
export function useJobPlannerJobLockSync() {
  const getJobIDs = useCallback(
    () => useUsersStore.getState().jobData.jobArray.map((j) => j.jobID),
    []
  );
  const getGroupIDs = useCallback(() => [], []);
  useLockScopeSync({
    getJobIDs,
    getGroupIDs,
    trackGroups: false,
    chunkSize: MAX_STATUS_BATCH_DOC_IDS,
  });
}

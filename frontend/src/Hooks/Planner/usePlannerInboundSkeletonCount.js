import useUsersStore from "../../Zustand/usersStore";

/**
 * Inbound `user_job_documents` upserts queued before flush — see `pendingInboundNewJobSkeletonByJobId`
 * in the jobs slice and `Functions/Debounce/inboundJobDocumentsCoalesce.js`.
 *
 * @param {number|string} stageId
 */
function useInboundSkeletonCountForJobPlanner(stageId) {
  return useUsersStore((s) => {
    const m = s.jobData.pendingInboundNewJobSkeletonByJobId;
    let n = 0;
    for (const meta of Object.values(m)) {
      if (Number(meta.stageId) === Number(stageId)) {
        n++;
      }
    }
    return n;
  });
}

/**
 * @param {number|string} stageId
 * @param {string|null|undefined} activeGroupID
 */
function useInboundSkeletonCountForGroupPlanner(stageId, activeGroupID) {
  return useUsersStore((s) => {
    const ag = activeGroupID ? String(activeGroupID) : "";
    if (!ag) return 0;
    const m = s.jobData.pendingInboundNewJobSkeletonByJobId;
    let n = 0;
    for (const meta of Object.values(m)) {
      if (Number(meta.stageId) !== Number(stageId)) continue;
      const gid = meta.groupID != null ? String(meta.groupID) : "";
      if (gid === ag) n++;
    }
    return n;
  });
}

/**
 * Links the existing page-level skeleton API (`skeletonElementsToDisplay` from job / group reducers,
 * used when creating jobs locally — planning stage only) with inbound WS placeholders for new jobs.
 *
 * @param {{ id: number|string }} status
 * @param {number} skeletonElementsToDisplay - From `useJobPlannerReducer` / group page state
 * @returns {{ skeletonCount: number, localSkeletonCount: number, inboundSkeletonCount: number }}
 */
export function useJobPlannerStageSkeletonCount(status, skeletonElementsToDisplay) {
  const inboundSkeletonCount = useInboundSkeletonCountForJobPlanner(status.id);
  const localSkeletonCount = status.id === 0 ? skeletonElementsToDisplay : 0;
  return {
    skeletonCount: localSkeletonCount + inboundSkeletonCount,
    localSkeletonCount,
    inboundSkeletonCount,
  };
}

/**
 * Uses `activeGroupID` from the jobs store (same context as the group page).
 *
 * @param {{ id: number|string }} status
 * @param {number} skeletonElementsToDisplay
 * @returns {{ skeletonCount: number, localSkeletonCount: number, inboundSkeletonCount: number }}
 */
export function useGroupPlannerStageSkeletonCount(status, skeletonElementsToDisplay) {
  const activeGroupID = useUsersStore((s) => s.jobData.activeGroupID);
  const inboundSkeletonCount = useInboundSkeletonCountForGroupPlanner(
    status.id,
    activeGroupID
  );
  const localSkeletonCount = status.id === 0 ? skeletonElementsToDisplay : 0;
  return {
    skeletonCount: localSkeletonCount + inboundSkeletonCount,
    localSkeletonCount,
    inboundSkeletonCount,
  };
}

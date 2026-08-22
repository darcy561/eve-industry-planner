/**
 * Placeholders for account_job_documents WS upserts that are new to this client (not yet merged into jobArray).
 * Cleared when the debounced flush applies jobs or when a delete is queued for that id.
 */

/**
 * @param {Function} set
 * @param {Function} get
 */
export const inboundSkeletonActions = (set) => ({
  /**
   * @param {string} jobID
   * @param {{ stageId: number, groupID: string }} meta - groupID "" when not grouped
   */
  addPendingInboundNewJobSkeleton: (jobID, meta) => {
    set(
      (state) => ({
        ...state,
        jobData: {
          ...state.jobData,
          pendingInboundNewJobSkeletonByJobId: {
            ...state.jobData.pendingInboundNewJobSkeletonByJobId,
            [jobID]: meta,
          },
        },
      }),
      false,
      "addPendingInboundNewJobSkeleton"
    );
  },

  /**
   * @param {string[]} jobIDs
   */
  removePendingInboundNewJobSkeletons: (jobIDs) => {
    if (!jobIDs?.length) return;
    set(
      (state) => {
        const next = { ...state.jobData.pendingInboundNewJobSkeletonByJobId };
        for (const id of jobIDs) {
          delete next[id];
        }
        return {
          ...state,
          jobData: {
            ...state.jobData,
            pendingInboundNewJobSkeletonByJobId: next,
          },
        };
      },
      false,
      "removePendingInboundNewJobSkeletons"
    );
  },
});

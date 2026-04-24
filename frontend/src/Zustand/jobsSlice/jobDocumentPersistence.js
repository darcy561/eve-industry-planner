/**
 * Queues job document writes for `PUT /api/v1/job-documents` (mirrors `groupManagement` + groups).
 */
import { scheduleDebouncedJobDocumentsSave } from "../../Functions/Debounce/jobDocumentsPersistSchedule.js";

/** @param {string[]|undefined} prev @param {string[]} ids */
function mergePendingJobDocumentWrites(prev, ids) {
  return [...new Set([...(prev ?? []), ...ids.filter(Boolean)])];
}

export const jobDocumentPersistenceActions = (set, get) => ({
  /**
   * @param {string|string[]} jobIDs
   */
  queueJobDocumentWrites: (jobIDs) => {
    const ids = Array.isArray(jobIDs) ? jobIDs : [jobIDs];
    if (!ids.length) return;
    set(
      (state) => ({
        ...state,
        jobData: {
          ...state.jobData,
          pendingJobDocumentWrites: mergePendingJobDocumentWrites(
            state.jobData.pendingJobDocumentWrites,
            ids
          ),
        },
      }),
      false,
      "queueJobDocumentWrites"
    );
  },

  /**
   * @param {string|string[]} jobIDs
   */
  queueJobDocumentWritesAndSchedule: (jobIDs) => {
    get().jobData.actions.queueJobDocumentWrites(jobIDs);
    scheduleDebouncedJobDocumentsSave();
  },

  /**
   * @param {string|string[]} jobIDs
   */
  queueJobDocumentWritesFromJobs: (jobs) => {
    const list = Array.isArray(jobs) ? jobs : [jobs];
    const ids = list.map((j) => j?.jobID).filter(Boolean);
    if (!ids.length) return;
    get().jobData.actions.updateOrAddJobsToJobArray(list);
    get().jobData.actions.queueJobDocumentWrites(ids);
  },

  /**
   * @param {string|string[]} jobIDs
   */
  queueJobDocumentWritesFromJobsAndSchedule: (jobs) => {
    get().jobData.actions.queueJobDocumentWritesFromJobs(jobs);
    scheduleDebouncedJobDocumentsSave();
  },

  /**
   * @param {string|string[]} [jobIDs] – omit to clear the whole queue
   */
  clearPendingJobDocumentWrites: (jobIDs) => {
    set(
      (state) => {
        const cur = state.jobData.pendingJobDocumentWrites ?? [];
        if (jobIDs == null) {
          return {
            ...state,
            jobData: { ...state.jobData, pendingJobDocumentWrites: [] },
          };
        }
        const remove = new Set(
          Array.isArray(jobIDs) ? jobIDs : [jobIDs]
        );
        return {
          ...state,
          jobData: {
            ...state.jobData,
            pendingJobDocumentWrites: cur.filter((id) => !remove.has(id)),
          },
        };
      },
      false,
      "clearPendingJobDocumentWrites"
    );
  },

  getPendingJobDocumentWritesPayload: () => {
    const { jobData } = get();
    const ids = [...new Set(jobData.pendingJobDocumentWrites ?? [])];
    const { findJobInJobArray } = get().jobData.actions;
    const out = [];
    for (const id of ids) {
      const job = findJobInJobArray(id);
      if (job) out.push(job);
    }
    return out;
  },
});

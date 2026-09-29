import { scheduleDebouncedJobDocumentsSave } from "../../Functions/Debounce/jobDocumentsPersistSchedule.js";
import { jobWriteEnvelope } from "../../Functions/JobDocuments/jobWriteEnvelope.js";

/**
 * Adds to the queue what a write must carry for each job it names, keeping
 * `null` — the whole document — wherever what changed is not known.
 *
 * @param {Record<string, Array<object>|null>|undefined} prev
 * @param {Record<string, Array<object>|null>} owed
 * @returns {Record<string, Array<object>|null>}
 */
function mergePendingJobDocumentWrites(prev, owed) {
  const next = { ...(prev ?? {}) };
  for (const [jobID, entries] of Object.entries(owed)) {
    if (!jobID) continue;
    const held = next[jobID];
    if (held === null || entries === null) {
      next[jobID] = null;
      continue;
    }
    next[jobID] = [...(held ?? []), ...entries];
  }
  return next;
}

/** @param {string|string[]} jobIDs @returns {Record<string, null>} */
function withoutChanges(jobIDs) {
  const ids = Array.isArray(jobIDs) ? jobIDs : [jobIDs];
  return Object.fromEntries(ids.filter(Boolean).map((id) => [id, null]));
}

export const jobDocumentPersistenceActions = (set, get) => ({
  /**
   * Queues a write that carries the whole document, for a change nothing
   * recorded as a log.
   *
   * @param {string|string[]} jobIDs
   */
  queueJobDocumentWrites: (jobIDs) => {
    get().jobData.actions.queueJobDocumentChanges(withoutChanges(jobIDs));
  },

  /**
   * Queues a write against what the reader changed, so it can carry those
   * fields rather than the whole document.
   *
   * @param {Record<string, Array<object>|null>} changes - Log entries per job id
   */
  queueJobDocumentChanges: (changes) => {
    if (!changes || Object.keys(changes).length === 0) return;
    set(
      (state) => ({
        jobData: {
          ...state.jobData,
          pendingJobDocumentWrites: mergePendingJobDocumentWrites(
            state.jobData.pendingJobDocumentWrites,
            changes,
          ),
        },
      }),
      false,
      "queueJobDocumentWrites",
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
   * @param {Array<object>|object} jobs
   * @param {Record<string, Array<object>>} [changes] - Log entries per job id;
   *   a job absent from it has its whole document written
   */
  queueJobDocumentWritesFromJobs: (jobs, changes = {}) => {
    const list = Array.isArray(jobs) ? jobs : [jobs];
    const ids = list.map((j) => j?.jobID).filter(Boolean);
    if (!ids.length) return;
    get().jobData.actions.updateOrAddJobsToJobArray(list);
    get().jobData.actions.queueJobDocumentChanges(
      Object.fromEntries(ids.map((id) => [id, changes[id] ?? null])),
    );
  },

  /**
   * @param {Array<object>|object} jobs
   * @param {Record<string, Array<object>>} [changes]
   */
  queueJobDocumentWritesFromJobsAndSchedule: (jobs, changes) => {
    get().jobData.actions.queueJobDocumentWritesFromJobs(jobs, changes);
    scheduleDebouncedJobDocumentsSave();
  },

  /**
   * @param {string|string[]} [jobIDs] – omit to clear the whole queue
   */
  clearPendingJobDocumentWrites: (jobIDs) => {
    set(
      (state) => {
        const cur = state.jobData.pendingJobDocumentWrites ?? {};
        if (jobIDs == null) {
          return {
            jobData: { ...state.jobData, pendingJobDocumentWrites: {} },
          };
        }
        const remove = new Set(Array.isArray(jobIDs) ? jobIDs : [jobIDs]);
        return {
          jobData: {
            ...state.jobData,
            pendingJobDocumentWrites: Object.fromEntries(
              Object.entries(cur).filter(([jobID]) => !remove.has(jobID)),
            ),
          },
        };
      },
      false,
      "clearPendingJobDocumentWrites",
    );
  },

  /**
   * Counts a landed write against the jobs it wrote, so the next write from the
   * same copy is checked against where the document now stands.
   *
   * @param {string|string[]} jobIDs
   */
  countWrittenJobRevisions: (jobIDs) => {
    const written = new Set(Array.isArray(jobIDs) ? jobIDs : [jobIDs]);
    if (written.size === 0) return;
    set(
      (state) => {
        for (const job of state.jobData.jobArray) {
          if (!written.has(job.jobID) || !job?._meta) continue;
          job._meta.revision = (job._meta.revision ?? 0) + 1;
        }
        return state;
      },
      false,
      "countWrittenJobRevisions",
    );
  },

  /**
   * The queued writes, each as the envelope the API reads, dropping any id with
   * no job left behind it or no change left to write.
   *
   * @returns {Array<object>}
   */
  getPendingJobDocumentWritesPayload: () => {
    const queued = get().jobData.pendingJobDocumentWrites ?? {};
    const { findJobInJobArray } = get().jobData.actions;
    const out = [];
    for (const [id, entries] of Object.entries(queued)) {
      const job = findJobInJobArray(id);
      if (!job) continue;
      const write = jobWriteEnvelope(job, entries);
      if (write) out.push(write);
    }
    return out;
  },
});

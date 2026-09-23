/**
 * Queues job document writes for `PUT /api/v1/job-documents` (mirrors `groupManagement` + groups).
 */
import { scheduleDebouncedJobDocumentsSave } from "../../Functions/Debounce/jobDocumentsPersistSchedule.js";

/**
 * Adds to the queue what a write must carry for each job it names.
 *
 * A job is queued against the log entries behind its write, or against `null`
 * where they are not known — an ESI refresh, a group operation, a job the close
 * recalculated. Joining the two keeps `null`: a write that cannot say what
 * changed carries the whole document, and a later write that can say does not
 * narrow it back.
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
   * The server increments the counter by one per write and answers a write built
   * on an older one with a refusal, so a write that landed moved its document on
   * by exactly one. Waiting for the document to come back instead would leave
   * every job stale between the write and its arrival, and a second edit in that
   * window would be refused against nothing but itself.
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
        // Nothing draws a revision, so the array is left as it is rather than
        // rebuilt: a new one here would re-render every job surface on each save.
        return state;
      },
      false,
      "countWrittenJobRevisions",
    );
  },

  getPendingJobDocumentWritesPayload: () => {
    const { jobData } = get();
    const ids = Object.keys(jobData.pendingJobDocumentWrites ?? {});
    const { findJobInJobArray } = get().jobData.actions;
    const out = [];
    for (const id of ids) {
      const job = findJobInJobArray(id);
      if (job) out.push(job);
    }
    return out;
  },
});

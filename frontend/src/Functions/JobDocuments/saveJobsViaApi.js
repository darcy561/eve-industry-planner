import useUsersStore from "../../Zustand/usersStore.js";
import { flushPendingJobDocumentsSave } from "../Debounce/jobDocumentsPersistSchedule.js";
import { jobWriteEnvelope } from "./jobWriteEnvelope.js";
import { persistJobChangeToApi } from "./persistJobDocumentsToApi.js";

/**
 * Queues jobs for `PUT /api/v1/job-documents`, flushes immediately, and answers
 * what the write did.
 *
 * @param {Array<object>|object} inputJobs - Job instance(s) with `jobID` and `toDocument`
 * @param {Record<string, Array<object>>} [changes] - Log entries per job id; a
 *   job absent from it has its whole document written
 * @returns {Promise<import("./persistJobDocumentsToApi.js").JobDocumentPersistOutcome>}
 */
export async function saveJobsViaApi(inputJobs, changes) {
  if (!inputJobs) return "saved";
  const jobs = Array.isArray(inputJobs) ? inputJobs : [inputJobs];
  if (jobs.length === 0) return "saved";

  useUsersStore
    .getState()
    .jobData.actions.queueJobDocumentWritesFromJobs(jobs, changes);
  return await flushPendingJobDocumentsSave();
}

/**
 * Saves jobs as one change, written together or not at all, taking anything already queued for
 * them into it so none of it goes separately.
 *
 * @param {Array<object>} jobs - Job instances with `jobID` and `toDocument`
 * @param {Record<string, Array<object>>} [changes] - Log entries per job id; a job absent from it
 *   has its whole document written
 * @returns {Promise<import("./persistJobDocumentsToApi.js").JobDocumentPersistOutcome>}
 */
export async function saveJobsAsOneChange(jobs, changes) {
  const { actions } = useUsersStore.getState().jobData;
  actions.updateOrAddJobsToJobArray(jobs);
  const owed = actions.takeQueuedJobDocumentWrites(
    jobs.map((job) => job?.jobID),
    changes,
  );
  const writes = jobs
    .filter((job) => job?.jobID)
    .map((job) => jobWriteEnvelope(job, owed[job.jobID]))
    .filter(Boolean);
  return await persistJobChangeToApi(writes);
}

/**
 * Debounced persist (multiple edits coalesce).
 * @param {Array<object>|object} inputJobs
 */
export function scheduleSaveJobsViaApi(inputJobs) {
  if (!inputJobs) return;
  const jobs = Array.isArray(inputJobs) ? inputJobs : [inputJobs];
  if (jobs.length === 0) return;
  useUsersStore
    .getState()
    .jobData.actions.queueJobDocumentWritesFromJobsAndSchedule(jobs);
}

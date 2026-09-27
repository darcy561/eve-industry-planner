import useUsersStore from "../../Zustand/usersStore.js";
import { flushPendingJobDocumentsSave } from "../Debounce/jobDocumentsPersistSchedule.js";

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

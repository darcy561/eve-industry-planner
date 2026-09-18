import useUsersStore from "../../Zustand/usersStore.js";
import { flushPendingJobDocumentsSave } from "../Debounce/jobDocumentsPersistSchedule.js";

/**
 * Queues jobs for `PUT /api/v1/job-documents` and flushes immediately.
 *
 * Answers what the write did, so a caller can tell one that landed from one the
 * server refused. The user-facing warning for a refusal is raised by the flush
 * itself, so a caller that does not care about the outcome can ignore it.
 *
 * @param {Array<object>|object} inputJobs - Job instance(s) with `jobID` and `toDocument`
 * @returns {Promise<import("./persistJobDocumentsToApi.js").JobDocumentPersistOutcome>}
 */
export async function saveJobsViaApi(inputJobs) {
  if (!inputJobs) return "saved";
  const jobs = Array.isArray(inputJobs) ? inputJobs : [inputJobs];
  if (jobs.length === 0) return "saved";

  useUsersStore.getState().jobData.actions.queueJobDocumentWritesFromJobs(jobs);
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

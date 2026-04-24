import useUsersStore from "../../Zustand/usersStore.js";
import { flushPendingJobDocumentsSave } from "../Debounce/jobDocumentsPersistSchedule.js";

/**
 * Queues jobs for `PUT /api/v1/job-documents` and flushes immediately (for `await` parity with legacy Firebase batch).
 *
 * @param {Array<object>|object} inputJobs - Job instance(s) with `jobID` and `toDocument`
 * @returns {Promise<void>}
 */
export async function saveJobsViaApi(inputJobs) {
  if (!inputJobs) return;
  const jobs = Array.isArray(inputJobs) ? inputJobs : [inputJobs];
  if (jobs.length === 0) return;

  useUsersStore.getState().jobData.actions.queueJobDocumentWritesFromJobs(jobs);
  await flushPendingJobDocumentsSave();
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

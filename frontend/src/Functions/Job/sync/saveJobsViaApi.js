import useUsersStore from "../../../Zustand/usersStore.js";
import { flushPendingJobDocumentsSave } from "../../Debounce/jobDocumentsPersistSchedule.js";
import { jobWriteEnvelope } from "./jobWrite.js";
import { persistJobChangeToApi } from "./persistJobDocumentsToApi.js";
import { revisionOf } from "./jobDelta.js";

/**
 * Queues jobs for `PUT /api/v1/job-documents`, flushes immediately, and answers what the write did.
 *
 * @param {Array<object>|object} inputJobs - Job instance(s) with `jobID` and `toDocument`
 * @param {Record<string, Array<object>>} [changes] - Log entries per job id; a
 *     job absent from it has its whole document written
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
 * Saves jobs and removes others as one change, made together or not at all, counting the revision on
 * each job saved once it lands; the caller puts the jobs on the planner.
 *
 * @param {Array<object>} jobs - Job instances with `jobID` and `toDocument`
 * @param {Record<string, Array<object>>} [changes] - Log entries per job id; a job absent from it
 *     has its whole document written
 * @param {Array<object>} [removed] - Jobs the change removes, as read, carrying their revision
 * @returns {Promise<import("./persistJobDocumentsToApi.js").JobDocumentPersistOutcome>}
 */
export async function saveJobsAsOneChange(jobs, changes, removed = []) {
  const { actions } = useUsersStore.getState().jobData;
  const owed = actions.takeQueuedJobDocumentWrites(
    [...jobs, ...removed].map((job) => job?.jobID),
    changes,
  );
  const writes = jobs
    .filter((job) => job?.jobID)
    .map((job) => jobWriteEnvelope(job, owed[job.jobID]))
    .filter(Boolean);
  const deletes = removed.map((job) => ({
    jobID: job.jobID,
    revision: revisionOf(job),
  }));
  const outcome = await persistJobChangeToApi(writes, deletes);
  if (outcome === "saved") {
    for (const job of jobs) {
      if (job?._meta) job._meta.revision = (job._meta.revision ?? 0) + 1;
    }
  }
  return outcome;
}

/**
 * Debounced persist (multiple edits coalesce).
 *
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

import useUsersStore from "../../Zustand/usersStore.js";
import { flushPendingJobDocumentsSave } from "../Debounce/jobDocumentsPersistSchedule.js";
import { jobWriteEnvelope } from "./jobWriteEnvelope.js";
import { persistJobChangeToApi } from "./persistJobDocumentsToApi.js";
import { toDocument } from "./jobDocument.js";
import { showSnackbarWarning } from "../../Events/snackbarEvents.js";
import { requestJobDocumentsByIdsFromApi } from "../Endpoints/Private/requestJobDocumentsByIds.js";

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
 * Saves jobs as one change, written together or not at all, taking anything already queued for them
 * into it so none of it goes separately.
 *
 * @param {Array<object>} jobs - Job instances with `jobID` and `toDocument`
 * @param {Record<string, Array<object>>} [changes] - Log entries per job id; a job absent from it
 *     has its whole document written
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

/**
 * Puts the jobs a refused change touched back to their saved copies, in the planner and under the
 * editor, and takes out the new jobs it would have created.
 *
 * @param {Array<string>} jobIDs - Jobs that exist on the server
 * @param {Array<string>} [newJobIDs] - Jobs the refused change would have created
 */
export async function restoreSavedJobs(jobIDs, newJobIDs = []) {
  const { jobData, editSession } = useUsersStore.getState();
  if (newJobIDs.length > 0) {
    jobData.actions.removeJobsFromJobArray(newJobIDs);
  }
  let saved;
  try {
    saved = await requestJobDocumentsByIdsFromApi(jobIDs);
  } catch (err) {
    console.error(
      "Saved jobs could not be read back after a refused save",
      err,
    );
    showSnackbarWarning(
      "The saved jobs could not be read back. Reload before saving again.",
      8,
    );
    return;
  }
  const found = new Set(saved.map((job) => job.jobID));
  jobData.actions.updateOrAddJobsToJobArray(saved);
  const gone = jobIDs.filter((jobID) => !found.has(jobID));
  if (gone.length > 0) {
    jobData.actions.removeJobsFromJobArray(gone);
  }
  for (const job of saved) {
    editSession.actions.documentArrived(job.jobID, toDocument(job));
  }
}

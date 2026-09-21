import useUsersStore from "../../Zustand/usersStore";

/**
 * Puts a job back as it was before editing, unless it is no longer there to put
 * back.
 *
 * What goes back is the document the session holds underneath what the reader
 * changed, so anything that arrived while they were editing survives. A job
 * deleted while they had it open is not there to restore, and adding it back
 * would show them a job they have just been told is gone — so every path that
 * discards an edit asks this rather than writing one in.
 *
 * @param {{jobID?: string}|null|undefined} job - the job as it should be left
 * @returns {boolean} whether the job was put back
 */
export function restoreJobIfStillHeld(job) {
  if (!job?.jobID) return false;
  const { findJobInJobArray, updateOrAddJobsToJobArray } =
    useUsersStore.getState().jobData.actions;
  if (!findJobInJobArray(job.jobID)) return false;
  updateOrAddJobsToJobArray(job);
  return true;
}

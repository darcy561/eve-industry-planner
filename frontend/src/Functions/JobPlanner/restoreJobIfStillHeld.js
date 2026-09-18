import useUsersStore from "../../Zustand/usersStore";

/**
 * Puts a job back as it was before editing, unless it is no longer there to put
 * back.
 *
 * Leaving an editor without saving restores the copy taken when it opened. A job
 * deleted while the reader had it open is not there to restore, and adding it
 * back would show them a job they have just been told is gone — so every path
 * that discards an edit asks this rather than writing the backup in.
 *
 * @param {{jobID?: string}|null|undefined} job - the backup taken when editing began
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

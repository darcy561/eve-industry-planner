import useUsersStore from "../../../Zustand/usersStore";
import { copyOfJob } from "../jobDocument.js";

/** Ends the edit session. */
export function endEditSession() {
  useUsersStore.getState().editSession.actions.closeSession();
}

/**
 * Leaves the job being edited as it now stands, dropping what the reader changed, and ends the
 * session.
 */
export function leaveEditedJobWhereItStands() {
  const { editSession } = useUsersStore.getState();

  const saved = editSession.draft.base[editSession.activeJobID];
  restoreJobIfStillHeld(saved?.jobID ? copyOfJob(saved) : saved);
  endEditSession();
}

/**
 * Puts a job back as it was before editing, unless it is no longer there to put back.
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

import useUsersStore from "../../../Zustand/usersStore";
import { copyOfJob } from "../jobDocument.js";

/**
 * Ends the edit session.
 *
 * The session is a slice of the store, so it outlives the page: a job left in it
 * is one the next open reads instead of loading, handing a reader back a draft
 * they walked away from. Every way of leaving a job goes through here or through
 * {@link leaveEditedJobWhereItStands}.
 */
export function endEditSession() {
  useUsersStore.getState().editSession.actions.closeSession();
}

/**
 * Leaves the job being edited as it now stands, dropping what the reader
 * changed, and ends the session.
 *
 * What goes back is the document the session holds underneath their changes, so
 * anything that arrived while they were editing is kept and only their own work
 * is dropped.
 */
export function leaveEditedJobWhereItStands() {
  const { editSession } = useUsersStore.getState();

  const saved = editSession.draft.base[editSession.activeJobID];
  restoreJobIfStillHeld(saved?.jobID ? copyOfJob(saved) : saved);
  endEditSession();
}

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

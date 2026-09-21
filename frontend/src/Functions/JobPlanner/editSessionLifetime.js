import useUsersStore from "../../Zustand/usersStore";
import { restoreJobIfStillHeld } from "./restoreJobIfStillHeld.js";
import workingCopyOfJob from "./workingCopyOfJob.js";

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

  restoreJobIfStillHeld(
    workingCopyOfJob(editSession.draft.base[editSession.activeJobID]),
  );
  endEditSession();
}

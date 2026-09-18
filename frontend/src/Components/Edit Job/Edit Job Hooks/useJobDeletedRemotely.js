import { useEffect } from "react";
import { JOBS_DELETED_REMOTELY_EVENT } from "../../../Functions/Debounce/inboundJobDocumentsCoalesce.js";
import { showSnackbarWarning } from "../../../Events/snackbarEvents";

/**
 * Tells a reader their job was deleted somewhere else, without taking the page
 * away from them.
 *
 * Surfaced rather than applied: the reader is working in this job, and closing
 * it for them would lose whatever they were part-way through with nowhere to put
 * it. What the close itself does is refuse to write the job back, so nothing
 * they do from here recreates it.
 *
 * @param {string|null|undefined} jobID - the job the editor is showing
 */
export function useJobDeletedRemotely(jobID) {
  useEffect(() => {
    if (!jobID) return undefined;

    function onDeletedRemotely(/** @type {CustomEvent} */ event) {
      const deleted = event?.detail?.jobIDs;
      if (!Array.isArray(deleted) || !deleted.includes(jobID)) return;
      showSnackbarWarning(
        "This job has been deleted by someone else. Your changes cannot be saved.",
        10,
      );
    }

    window.addEventListener(JOBS_DELETED_REMOTELY_EVENT, onDeletedRemotely);
    return () => {
      window.removeEventListener(
        JOBS_DELETED_REMOTELY_EVENT,
        onDeletedRemotely,
      );
    };
  }, [jobID]);
}

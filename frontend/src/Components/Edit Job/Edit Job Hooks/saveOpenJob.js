import useUsersStore from "../../../Zustand/usersStore";
import closeActiveJob from "../../../Functions/JobPlanner/closeActiveJob";
import { jobDraftNow } from "./useJobDraft";
import { entriesFor, hasChanges, heldFor } from "./jobDraftStore";
import { openChangeReview } from "../../../Events/changeReviewEvents";

/**
 * Saves the job the editor holds and ends the session, unless changes set aside by an incoming save
 * are still to review or the save is refused, which keep the editor open.
 *
 * @param {import("@tanstack/react-query").QueryClient} queryClient
 * @returns {Promise<"closed"|"kept-open">}
 */
export async function saveOpenJob(queryClient) {
  const {
    draft,
    activeJobID,
    temporaryChildJobs,
    esiDataToLink,
    parentChildToEdit,
  } = useUsersStore.getState().editSession;

  if (heldFor(draft, activeJobID).length > 0) {
    openChangeReview();
    return "kept-open";
  }

  return await closeActiveJob(
    jobDraftNow(),
    hasChanges(draft),
    temporaryChildJobs,
    esiDataToLink,
    parentChildToEdit,
    queryClient,
    entriesFor(draft, activeJobID),
  );
}

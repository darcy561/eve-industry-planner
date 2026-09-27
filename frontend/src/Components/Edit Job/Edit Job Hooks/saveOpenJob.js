import useUsersStore from "../../../Zustand/usersStore";
import closeActiveJob from "../../../Functions/JobPlanner/closeActiveJob";
import { jobDraftNow } from "./useJobDraft";
import { entriesFor, hasChanges } from "./jobDraftStore";

/**
 * Saves the job the editor holds and ends the session, reading what it needs off
 * the session at the moment the reader presses.
 *
 * @param {import("@tanstack/react-query").QueryClient} queryClient
 * @returns {Promise<void>}
 */
export async function saveOpenJob(queryClient) {
  const {
    draft,
    activeJobID,
    temporaryChildJobs,
    esiDataToLink,
    parentChildToEdit,
  } = useUsersStore.getState().editSession;

  await closeActiveJob(
    jobDraftNow(),
    hasChanges(draft),
    temporaryChildJobs,
    esiDataToLink,
    parentChildToEdit,
    queryClient,
    entriesFor(draft, activeJobID),
  );
}

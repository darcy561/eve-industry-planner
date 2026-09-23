import useUsersStore from "../../../Zustand/usersStore";
import closeActiveJob from "../../../Functions/JobPlanner/closeActiveJob";
import { jobDraftNow } from "./useJobDraft";
import { entriesFor, hasChanges } from "./jobDraftStore";

/**
 * Saves the job the editor holds, and ends the session.
 *
 * Four controls close a job — the save icon, both halves of the leave prompt,
 * and the button that opens a child job — and each has to hand the save the same
 * six pieces of the session. They are read here at the moment the reader
 * presses, because none of those controls draws any of it: a control subscribed
 * to the whole session to have it ready would re-render on every edit made
 * anywhere on the page.
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

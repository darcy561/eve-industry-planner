import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { routeBackFromEditJob } from "../../../Functions/Groups/groupPageViewSearch";
import { yieldEditJobDocumentLocksOnLeave } from "../../../Functions/DocumentLock/yieldEditJobDocumentLocksOnLeave.js";
import useUsersStore from "../../../Zustand/usersStore";
import { closeActiveJob } from "../../../Functions/Job/editing/closeActiveJob";
import { entriesFor, hasChanges, heldFor } from "./jobDraftStore";
import { openChangeReview } from "../../../Events/changeReviewEvents";
import { jobDraftNow, useJobDraft } from "./useJobDraft";

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

/**
 * Saves the open job and returns to the group or planner it came from, staying on the page when the
 * editor is kept open.
 *
 * @returns {() => Promise<"left"|"kept-open">}
 */
export function useSaveAndLeave() {
  const queryClient = useQueryClient();
  const navigate = useNavigate({ from: "/editjob/$jobID" });
  const search = useSearch({ from: "/editjob/$jobID" });
  const { jobID } = useParams({ from: "/editjob/$jobID" });
  const openJobID = useJobDraft((job) => job.jobID);

  return async function saveAndLeave() {
    if ((await saveOpenJob(queryClient)) === "kept-open") return "kept-open";
    await yieldEditJobDocumentLocksOnLeave({ jobID });
    await navigate(routeBackFromEditJob(search, openJobID));
    return "left";
  };
}

import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { saveOpenJob } from "./saveOpenJob";
import { buildGroupSearchAfterEditClose } from "../../../Functions/Groups/groupPageViewSearch";
import { yieldEditJobDocumentLocksOnLeave } from "../../../Functions/DocumentLock/yieldEditJobDocumentLocksOnLeave.js";
import { useJobDraft } from "./useJobDraft";

/**
 * Saves the open job and returns to the group or planner it came from, staying on the page when the
 * editor is kept open.
 *
 * @returns {() => Promise<void>}
 */
export function useSaveAndLeave() {
  const queryClient = useQueryClient();
  const navigate = useNavigate({ from: "/editjob/$jobID" });
  const search = useSearch({ from: "/editjob/$jobID" });
  const { jobID } = useParams({ from: "/editjob/$jobID" });
  const openJobID = useJobDraft((job) => job.jobID);

  return async function saveAndLeave() {
    if ((await saveOpenJob(queryClient)) === "kept-open") return;
    const groupIDFromParams = search.activeGroup;
    await yieldEditJobDocumentLocksOnLeave({ jobID });

    if (groupIDFromParams) {
      navigate({
        to: "/group/$groupID",
        params: { groupID: groupIDFromParams },
        search: buildGroupSearchAfterEditClose(search, openJobID),
      });
    } else {
      navigate({ to: "/jobplanner" });
    }
  };
}

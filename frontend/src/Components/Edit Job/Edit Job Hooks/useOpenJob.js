import { useNavigate, useSearch } from "@tanstack/react-router";
import { requestEditJobNavigation } from "../../../Events/editJobNavigationEvents";
import { editJobSearchToCarry } from "../../../Functions/Groups/groupPageViewSearch";

/**
 * Opens another job from the editor, through the page's leave rules where it has any, carrying the
 * group and view it came from; `onUnhandled` stands in for going straight there.
 *
 * @returns {(jobID: string, options?: {onUnhandled?: (search: object) => void}) => Promise<void>}
 */
export function useOpenJob() {
  const navigate = useNavigate({ from: "/editjob/$jobID" });
  const search = useSearch({ from: "/editjob/$jobID" });

  return async function openJob(jobID, { onUnhandled } = {}) {
    const carried = editJobSearchToCarry(search);
    const outcome = await requestEditJobNavigation({ jobID, search: carried });
    if (outcome !== "not-handled") return;
    if (onUnhandled) {
      onUnhandled(carried);
      return;
    }
    navigate({ to: "/editjob/$jobID", params: { jobID }, search: carried });
  };
}

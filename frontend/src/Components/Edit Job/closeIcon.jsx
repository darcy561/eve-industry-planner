import { IconButton, Tooltip } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { buildGroupSearchAfterEditClose } from "../../Functions/Groups/groupPageViewSearch";
import { yieldEditJobDocumentLocksOnLeave } from "../../Functions/DocumentLock/yieldEditJobDocumentLocksOnLeave.js";
import { leaveEditedJobWhereItStands } from "../../Functions/Job/editing/editSessionLifetime.js";

/**
 * Closing leaves the reader on the job as it now stands, which is the document
 * the session holds underneath what they changed rather than a copy taken when
 * they opened it — anything that arrived while they were editing survives.
 */
export function CloseJobIcon() {
  const navigate = useNavigate({ from: "/editjob/$jobID" });
  const search = useSearch({ from: "/editjob/$jobID" });
  const { jobID } = useParams({ from: "/editjob/$jobID" });

  async function onClick() {
    const groupID = search.activeGroup;
    await yieldEditJobDocumentLocksOnLeave({ jobID });
    leaveEditedJobWhereItStands();

    if (groupID) {
      navigate({
        to: "/group/$groupID",
        params: { groupID },
        search: buildGroupSearchAfterEditClose(search, jobID),
      });
    } else {
      navigate({ to: "/jobplanner" });
    }
  }

  return (
    <Tooltip
      title="Returns to the job planner without saving changes to the job."
      arrow
      placement="bottom"
    >
      <IconButton color="primary" size="medium" onClick={onClick}>
        <CloseIcon />
      </IconButton>
    </Tooltip>
  );
}

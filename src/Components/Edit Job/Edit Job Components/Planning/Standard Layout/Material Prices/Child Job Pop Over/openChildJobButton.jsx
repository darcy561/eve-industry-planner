import { Button } from "@mui/material";
import { useCloseActiveJob } from "../../../../../../../Hooks/JobHooks/useCloseActiveJob";
import { useLocation, useNavigate } from "react-router-dom";

export function OpenChildJobButon_ChildJobPopoverFrame({
  activeJob,
  jobModified,
  temporaryChildJobs,
  esiDataToLink,
  parentChildToEdit,
  childJobObjects,
  jobDisplay,
}) {
  const { closeActiveJob } = useCloseActiveJob();
  const navigate = useNavigate();
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);

  return (
    <Button
      size="small"
      onClick={async () => {
        await closeActiveJob(
          activeJob,
          jobModified,
          temporaryChildJobs,
          esiDataToLink,
          parentChildToEdit
        );
        const groupIDFromParams = queryParams.get("activeGroup");
        let navigationURL = `/editjob/${childJobObjects[jobDisplay].jobID}`;
        if (groupIDFromParams) {
          navigationURL += `?activeGroup=${groupIDFromParams}`;
        }
        navigate(navigationURL);
      }}
    >
      Open Child Job
    </Button>
  );
}

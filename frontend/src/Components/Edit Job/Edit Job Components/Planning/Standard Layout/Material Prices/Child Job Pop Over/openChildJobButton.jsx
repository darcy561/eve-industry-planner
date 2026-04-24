import { Button } from "@mui/material";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import closeActiveJob from "../../../../../../../Functions/JobPlanner/closeActiveJob";

export function OpenChildJobButon_ChildJobPopoverFrame({
  state,
  childJobObjects,
  jobDisplay,
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate({ from: '/editjob/$jobID' });
  const search = useSearch({ from: '/editjob/$jobID' });

  return (
    <Button
      size="small"
      onClick={async () => {
        await closeActiveJob(
          state.activeJob,
          state.jobModified,
          state.temporaryChildJobs,
          state.esiDataToLink,
          state.parentChildToEdit,
          queryClient
        );
        const groupIDFromParams = search.activeGroup;
        
        if (groupIDFromParams) {
          navigate({ 
            to: '/editjob/$jobID', 
            params: { jobID: childJobObjects[jobDisplay].jobID },
            search: { activeGroup: groupIDFromParams }
          });
        } else {
          navigate({ 
            to: '/editjob/$jobID', 
            params: { jobID: childJobObjects[jobDisplay].jobID }
          });
        }
      }}
    >
      Open Child Job
    </Button>
  );
}

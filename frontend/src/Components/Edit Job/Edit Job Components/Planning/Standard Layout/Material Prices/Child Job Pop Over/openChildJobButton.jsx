import { Button } from "@mui/material";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { requestEditJobNavigation } from "../../../../../../../Events/editJobNavigationEvents";

export function OpenChildJobButon_ChildJobPopoverFrame({
  state,
  childJobObjects,
  jobDisplay,
}) {
  const navigate = useNavigate({ from: '/editjob/$jobID' });
  const search = useSearch({ from: '/editjob/$jobID' });

  return (
    <Button
      size="small"
      onClick={async () => {
        const childId = childJobObjects[jobDisplay].jobID;
        const groupIDFromParams = search.activeGroup;
        const navSearch = {};
        if (groupIDFromParams != null && String(groupIDFromParams) !== "") {
          navSearch.activeGroup = groupIDFromParams;
        }
        if (search.pageView != null && String(search.pageView) !== "") {
          navSearch.pageView = search.pageView;
        }
        const outcome = await requestEditJobNavigation({
          jobID: childId,
          search: navSearch,
        });
        if (outcome === "not-handled") {
          navigate({
            to: "/editjob/$jobID",
            params: { jobID: childId },
            search: navSearch,
          });
        }
      }}
    >
      Open Child Job
    </Button>
  );
}

import { useState } from "react";
import { Button } from "@mui/material";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { requestEditJobNavigation } from "../../../../../../../Events/editJobNavigationEvents";
import closeActiveJob from "../../../../../../../Functions/JobPlanner/closeActiveJob";
import useUsersStore from "../../../../../../../Zustand/usersStore";
import EditJobLeaveConfirmDialogue from "../../../../../EditJobLeaveConfirmDialogue";
import { yieldEditJobDocumentLocksOnLeave } from "../../../../../../../Functions/DocumentLock/yieldEditJobDocumentLocksOnLeave.js";
import { useActiveJobPersistGate } from "../../../../../Edit Job Hooks/useActiveJobDocumentLock";

export function OpenChildJobButon_ChildJobPopoverFrame({
  state,
  childJobObjects,
  jobDisplay,
}) {
  const navigate = useNavigate({ from: '/editjob/$jobID' });
  const search = useSearch({ from: '/editjob/$jobID' });
  const { jobID: routeJobID } = useParams({ from: "/editjob/$jobID" });
  const queryClient = useQueryClient();
  const [fallbackOpen, setFallbackOpen] = useState(false);
  const [leaveSaving, setLeaveSaving] = useState(false);
  const [pendingNav, setPendingNav] = useState(null);
  const { setActiveJobID } = useUsersStore.getState().jobData.actions;
  const persist = useActiveJobPersistGate(state);

  const closeFallbackDialogue = () => {
    if (leaveSaving) return;
    setFallbackOpen(false);
    setPendingNav(null);
  };

  const navigateToPendingJob = async () => {
    if (!pendingNav) return;
    await yieldEditJobDocumentLocksOnLeave({
      jobID: routeJobID,
      groupID: search.activeGroup,
    });
    navigate({
      to: "/editjob/$jobID",
      params: { jobID: pendingNav.jobID },
      search: pendingNav.search,
    });
    setFallbackOpen(false);
    setPendingNav(null);
  };

  return (
    <>
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
            if (state.jobModified) {
              setPendingNav({ jobID: childId, search: navSearch });
              setFallbackOpen(true);
              return;
            }
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
      <EditJobLeaveConfirmDialogue
        open={fallbackOpen}
        onClose={closeFallbackDialogue}
        onDiscard={async () => {
          setActiveJobID(null);
          await navigateToPendingJob();
        }}
        saveDisabled={!persist.canPersist}
        onSave={async () => {
          if (!pendingNav || !persist.canPersist) return;
          setLeaveSaving(true);
          try {
            await closeActiveJob(
              state.activeJob,
              state.jobModified,
              state.temporaryChildJobs,
              state.esiDataToLink,
              state.parentChildToEdit,
              queryClient
            );
            navigateToPendingJob();
          } finally {
            setLeaveSaving(false);
          }
        }}
        leaveSaving={leaveSaving}
        currentJobName={state.activeJob?.name ?? ""}
        nextJobName={childJobObjects[jobDisplay]?.name ?? null}
      />
    </>
  );
}

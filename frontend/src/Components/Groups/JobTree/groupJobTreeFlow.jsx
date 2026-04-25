import { useCallback, useEffect, useMemo, useState } from "react";
import { Typography } from "@mui/material";
import { useNavigate } from "@tanstack/react-router";
import ContentPanel from "../../../Styled Components/Paper/ContentPanel";
import JobDependencyTreeFlow from "../../../Styled Components/JobTreeFlow/JobDependencyTreeFlow";
import useUsersStore from "../../../Zustand/usersStore";
import { buildGroupSearchAfterEditClose } from "../../../Functions/Groups/groupPageViewSearch";
import { openJobDependencyTreeDialog } from "../../../Events/jobDependencyTreeDialogEvents";

export default function GroupJobTreeFlow({
  groupJobs = [],
  routeGroupID,
  editReturnPageView,
  highlightedItems,
  focusJobId,
}) {
  const navigate = useNavigate({ from: "/group/$groupID" });
  const activeGroupID = useUsersStore((s) => s.jobData.activeGroupID);
  const groupArray = useUsersStore((s) => s.jobData.groupArray);
  const getGroupObject = useUsersStore(
    (s) => s.jobData.actions.getGroupObject
  );
  const groupForEditSearch = routeGroupID || activeGroupID || undefined;
  const jobArray = useUsersStore((s) => s.jobData.jobArray);

  const activeGroupObject = useMemo(() => {
    if (!routeGroupID) return null;
    return getGroupObject(routeGroupID);
  }, [routeGroupID, groupArray, getGroupObject]);

  const groupCompleteSet = activeGroupObject?.areComplete ?? new Set();

  const liveGroupJobs = useMemo(() => {
    const byId = new Map(jobArray.map((j) => [j.jobID, j]));
    return groupJobs.map((j) => byId.get(j.jobID) ?? j);
  }, [jobArray, groupJobs]);

  const groupJobIdSet = useMemo(
    () => new Set(groupJobs.map((j) => String(j.jobID))),
    [groupJobs]
  );

  const panelChainIds = useMemo(() => {
    if (!highlightedItems || highlightedItems.size === 0) return null;
    const out = new Set();
    for (const id of highlightedItems) {
      const sid = String(id);
      if (groupJobIdSet.has(sid)) out.add(sid);
    }
    return out.size > 0 ? out : null;
  }, [highlightedItems, groupJobIdSet]);

  /** Bumps when `focusJobId` appears so fitView runs even if the job id repeats. */
  const [focusSession, setFocusSession] = useState(0);
  useEffect(() => {
    if (!focusJobId) return;
    setFocusSession((n) => n + 1);
  }, [focusJobId]);

  useEffect(() => {
    if (!focusJobId || !routeGroupID) return;
    const t = window.setTimeout(() => {
      navigate({
        to: "/group/$groupID",
        params: { groupID: routeGroupID },
        search: buildGroupSearchAfterEditClose(
          { pageView: editReturnPageView },
          undefined
        ),
        replace: true,
      });
    }, 850);
    return () => window.clearTimeout(t);
  }, [focusJobId, routeGroupID, editReturnPageView, navigate]);

  const onJobDoubleClick = useCallback(
    (jobID) => {
      if (groupForEditSearch) {
        navigate({
          to: "/editjob/$jobID",
          params: { jobID },
          search: {
            activeGroup: groupForEditSearch,
            ...(editReturnPageView ? { pageView: editReturnPageView } : {}),
          },
        });
      } else {
        navigate({ to: "/editjob/$jobID", params: { jobID } });
      }
    },
    [navigate, groupForEditSearch, editReturnPageView]
  );

  const groupHelpText = (
    <Typography variant="subtitle2" color="text.secondary">
      Built jobs feed <strong>up</strong> the chain; layout is top-down. Lines run from child to
      parent. <strong>Click</strong> a job to lock highlight for its parents and children;{" "}
      <strong>double-click</strong> to edit. Use the right panel <strong>highlight</strong> icon on
      an output job to dim the tree to that production chain and its connectors. Pan: drag the canvas
      (including over jobs) or two-finger scroll; zoom: toolbar, pinch, or{" "}
      <strong>Ctrl</strong> / <strong>⌘</strong> + scroll.
    </Typography>
  );

  if (groupJobs.length === 0) {
    return (
      <ContentPanel
        componentName="Group job tree"
        paperSx={{ padding: 2, overflow: "hidden" }}
      >
        <Typography color="text.secondary">No jobs in this group.</Typography>
      </ContentPanel>
    );
  }

  const focusInGroup =
    focusJobId && groupJobIdSet.has(String(focusJobId))
      ? String(focusJobId)
      : undefined;

  const openTreeDialog = useCallback(() => {
    if (routeGroupID) {
      openJobDependencyTreeDialog({
        groupId: routeGroupID,
        jobIds: null,
        chainHighlightJobIds: panelChainIds ? [...panelChainIds] : null,
        initialFocusJobId: focusJobId,
        title: "Job dependency tree",
        editReturnPageView: editReturnPageView,
        activeGroupForEdit: groupForEditSearch,
      });
    } else {
      openJobDependencyTreeDialog({
        groupId: null,
        jobIds: groupJobs.map((j) => j.jobID),
        chainHighlightJobIds: panelChainIds ? [...panelChainIds] : null,
        initialFocusJobId: focusJobId,
        title: "Job dependency tree",
        editReturnPageView: editReturnPageView,
        activeGroupForEdit: groupForEditSearch,
      });
    }
  }, [
    routeGroupID,
    panelChainIds,
    focusJobId,
    editReturnPageView,
    groupForEditSearch,
    groupJobs,
  ]);

  return (
    <ContentPanel
      componentName="Group job tree"
      paperSx={{
        padding: 0,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: 0,
        height: "100%",
      }}
    >
      <JobDependencyTreeFlow
        jobs={liveGroupJobs}
        completeJobIds={groupCompleteSet}
        chainHighlightJobIds={panelChainIds ?? undefined}
        onJobDoubleClick={onJobDoubleClick}
        showHelpText
        helpText={groupHelpText}
        onOpenInDialog={openTreeDialog}
        interactionResetKey={routeGroupID}
        initialFocusJobId={focusInGroup}
        focusRequestKey={focusInGroup ? focusSession : undefined}
        sx={{ flex: 1, minHeight: 0, height: "100%" }}
      />
    </ContentPanel>
  );
}

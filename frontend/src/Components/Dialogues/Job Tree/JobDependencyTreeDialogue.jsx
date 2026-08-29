import { useCallback, useEffect, useMemo, useState } from "react";
import { Box, Typography } from "@mui/material";
import { useNavigate } from "@tanstack/react-router";
import ContentDialogue, {
  DialogueCloseAction,
  useDialogueEventState,
} from "../../../Styled Components/Dialogue/ContentDialogue";
import JobDependencyTreeFlow from "../../../Styled Components/JobTreeFlow/JobDependencyTreeFlow";
import useUsersStore from "../../../Zustand/usersStore";
import { JOB_DEPENDENCY_TREE_DIALOGUE_EVENT } from "../../../Events/jobDependencyTreeDialogueEvents";
import { requestEditJobNavigation } from "../../../Events/editJobNavigationEvents";
import { resolveEditJobLinkTreePayload } from "./resolveEditJobLinkTreePayload";
import { trackAppEvent } from "../../../analytics/trackAppEvent";
import { AppEvent } from "../../../analytics/appEventNames";

const defaultState = () => ({
  isOpen: false,
  openSession: 0,
  fromEditContext: false,
  editContextJobId: null,
  editSearchActiveGroup: null,
  editSearchPageView: null,
  groupId: null,
  jobIds: null,
  chainHighlightJobIds: null,
  initialFocusJobId: null,
  title: "Job dependency tree",
  showHelpText: true,
  editReturnPageView: "jobTree",
  activeGroupForEdit: null,
});

/**
 * Global dialogue: interactive job dependency tree ({@link JobDependencyTreeFlow}).
 * - `openJobDependencyTreeDialogue` — pass job ids, group, highlights, etc.
 * - `openJobLinkTreeFromEditPage` — pass only the edited job id and route search; resolution lives here.
 */
export default function JobDependencyTreeDialogue() {
  const [messageData, , resetDialogue] = useDialogueEventState(
    JOB_DEPENDENCY_TREE_DIALOGUE_EVENT,
    defaultState
  );

  const jobArray = useUsersStore((s) => s.jobData.jobArray);
  const getGroupObject = useUsersStore((s) => s.jobData.actions.getGroupObject);

  const navigate = useNavigate();

  const handleClose = useCallback(() => {
    resetDialogue();
  }, [resetDialogue]);

  const view = useMemo(() => {
    if (!messageData.isOpen) {
      return {
        jobs: [],
        completeJobIds: new Set(),
        chainSet: null,
        focusInTree: undefined,
        groupForEdit: undefined,
        editPageView: "jobTree",
      };
    }

    const byId = new Map(jobArray.map((j) => [String(j.jobID), j]));

    let gId;
    let wantIds;
    let focus;
    let chain;
    let groupForEdit;
    let editPageView;

    if (messageData.fromEditContext && messageData.editContextJobId) {
      const r = resolveEditJobLinkTreePayload(
        messageData.editContextJobId,
        messageData.editSearchActiveGroup,
        jobArray,
        getGroupObject
      );
      if (!r) {
        return {
          jobs: [],
          completeJobIds: new Set(),
          chainSet: null,
          focusInTree: undefined,
          groupForEdit:
            messageData.editSearchActiveGroup != null
              ? String(messageData.editSearchActiveGroup)
              : undefined,
          editPageView:
            messageData.editSearchPageView != null
              ? messageData.editSearchPageView
              : (messageData.editReturnPageView ?? "jobTree"),
        };
      }
      gId = r.depTreeGroupId;
      wantIds = r.jobIds;
      focus = r.initialFocusJobId;
      chain = null;
      groupForEdit = r.activeGroupForEdit ?? undefined;
      editPageView =
        messageData.editSearchPageView != null
          ? messageData.editSearchPageView
          : (messageData.editReturnPageView ?? "jobTree");
    } else {
      gId = messageData.groupId;
      wantIds = messageData.jobIds ?? null;
      focus = messageData.initialFocusJobId;
      chain = messageData.chainHighlightJobIds;
      groupForEdit = messageData.activeGroupForEdit ?? gId ?? undefined;
      editPageView = messageData.editReturnPageView ?? "jobTree";
    }

    const chainSetOrNull =
      chain && chain.length ? new Set(chain.map(String)) : null;

    if (gId) {
      const g = getGroupObject(gId);
      if (g) {
        const inGroup = [...g.includedJobIDs]
          .map(String)
          .filter((id) => {
            if (wantIds != null && wantIds.length) {
              return wantIds.includes(id);
            }
            return true;
          });
        const out = inGroup.map((id) => byId.get(id)).filter(Boolean);
        const f = focus;
        const focusInTree =
          f && inGroup.includes(String(f)) ? String(f) : undefined;
        return {
          jobs: out,
          completeJobIds: g.areComplete instanceof Set ? g.areComplete : new Set(),
          chainSet: chainSetOrNull,
          focusInTree,
          groupForEdit,
          editPageView,
        };
      }
    }
    if (wantIds && wantIds.length) {
      const out = wantIds.map((id) => byId.get(String(id))).filter(Boolean);
      const f = focus;
      const canFocus = f && out.some((j) => String(j.jobID) === String(f));
      return {
        jobs: out,
        completeJobIds: new Set(),
        chainSet: chainSetOrNull,
        focusInTree: canFocus ? String(f) : undefined,
        groupForEdit,
        editPageView,
      };
    }
    return {
      jobs: [],
      completeJobIds: new Set(),
      chainSet: chainSetOrNull,
      focusInTree: undefined,
      groupForEdit,
      editPageView,
    };
  }, [messageData, jobArray, getGroupObject]);

  const {
    jobs,
    completeJobIds,
    chainSet,
    focusInTree,
    groupForEdit,
    editPageView,
  } = view;

  const [fitSession, setFitSession] = useState(0);
  const [trackedOpenSession, setTrackedOpenSession] = useState(null);
  useEffect(() => {
    if (!messageData.isOpen) return;
    if (trackedOpenSession === messageData.openSession) return;
    setTrackedOpenSession(messageData.openSession);
    trackAppEvent(AppEvent.VIEW_JOB_TREE_DIALOGUE);
  }, [messageData.isOpen, messageData.openSession, trackedOpenSession]);

  useEffect(() => {
    if (!messageData.isOpen) return;
    if (!focusInTree) return;
    setFitSession((n) => n + 1);
  }, [messageData.isOpen, focusInTree, messageData.openSession]);

  const onJobDoubleClick = useCallback(
    async (jobID) => {
      const navSearch = groupForEdit
        ? {
            activeGroup: groupForEdit,
            ...(editPageView ? { pageView: editPageView } : {}),
          }
        : {};
      const outcome = await requestEditJobNavigation({
        jobID,
        search: navSearch,
      });
      if (outcome === "navigated") {
        resetDialogue();
        return;
      }
      if (outcome === "cancelled") {
        return;
      }
      if (groupForEdit) {
        navigate({
          to: "/editjob/$jobID",
          params: { jobID },
          search: navSearch,
        });
      } else {
        navigate({ to: "/editjob/$jobID", params: { jobID } });
      }
      resetDialogue();
    },
    [navigate, groupForEdit, editPageView, resetDialogue]
  );

  if (!messageData.isOpen) return null;

  const hasJobs = jobs.length > 0;
  const emptyMessage = messageData.fromEditContext
    ? "No related jobs found in this scope, or the job is not in the job list."
    : "No jobs to show. Pass a group and/or job ids when opening the dialogue.";

  const helpText = (
    <Typography variant="subtitle2" color="text.secondary" component="div">
      Same controls as the group <strong>Job tree</strong> view: click a job to focus the chain;{" "}
      double-click to open the job. Pan and zoom the canvas; use <strong>Close</strong> when
      done.
    </Typography>
  );

  return (
    <ContentDialogue
      open
      onClose={handleClose}
      title={messageData.title}
      componentName="JobDependencyTreeDialogue"
      maxWidth="xl"
      fullWidth
      actions={<DialogueCloseAction onClose={handleClose} />}
      dialogueSx={{
        "& .MuiDialog-paper": {
          height: { xs: "100%", sm: "min(90vh, 900px)" },
          maxHeight: "95vh",
          display: "flex",
          flexDirection: "column",
        },
      }}
      dialogueContentSx={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: 0,
        p: 0,
        overflow: "hidden",
      }}
    >
      {!hasJobs ? (
        <Box sx={{ p: 2 }}>
          <Typography color="text.secondary" component="div">
            {emptyMessage}
          </Typography>
        </Box>
      ) : (
        <JobDependencyTreeFlow
          jobs={jobs}
          completeJobIds={completeJobIds}
          chainHighlightJobIds={chainSet && chainSet.size > 0 ? chainSet : undefined}
          onJobDoubleClick={onJobDoubleClick}
          showHelpText={messageData.showHelpText}
          helpText={messageData.showHelpText ? helpText : undefined}
          interactionResetKey={messageData.openSession}
          initialFocusJobId={focusInTree}
          focusRequestKey={focusInTree != null ? fitSession : undefined}
          minHeight={420}
          sx={{ flex: 1, minHeight: 0, height: "100%", width: "100%" }}
        />
      )}
    </ContentDialogue>
  );
}

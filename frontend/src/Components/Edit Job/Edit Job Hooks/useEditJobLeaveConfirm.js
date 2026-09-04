import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import useUsersStore from "../../../Zustand/usersStore";
import closeActiveJob from "../../../Functions/JobPlanner/closeActiveJob";
import {
  registerEditJobNavigateHandler,
  unregisterEditJobNavigateHandler,
} from "../../../Events/editJobNavigationEvents";
import {
  registerEditJobReleaseRequestHandler,
  unregisterEditJobReleaseRequestHandler,
} from "../../../Events/editJobReleaseRequestEvents";
import { closeJobDependencyTreeDialogue } from "../../../Events/jobDependencyTreeDialogueEvents";
import { mergeEditJobNavigationSearch } from "./mergeEditJobNavigationSearch";
import { buildGroupSearchAfterEditClose } from "../../../Functions/Groups/groupPageViewSearch";
import { useActiveJobPersistGate } from "./useActiveJobDocumentLock";
import { yieldEditJobDocumentLocksOnLeave } from "../../../Functions/DocumentLock/yieldEditJobDocumentLocksOnLeave.js";

/**
 * Registers two handlers while the edit-job page is mounted:
 *
 *     chips, child job button) can request navigation to another job with the
 *     standard save / discard rules.
 *     prompt for save / discard before handing the lock to a requesting tab,
 *     instead of dropping it to neutral.
 *
 * Both flows share the unsaved-changes dialogue; `dialogueMode` selects copy and
 * routes the outcome to the right resolver.
 *
 * @param {{ backupJobRef: import("react").MutableRefObject<unknown>, state: object }} params
 */
export function useEditJobLeaveConfirm({ backupJobRef, state }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate({ from: "/editjob/$jobID" });
  const { jobID: routeJobID } = useParams({ from: "/editjob/$jobID" });
  const routeSearch = useSearch({ from: "/editjob/$jobID" });
  const { setActiveJobID } = useUsersStore.getState().jobData.actions;

  const stateRef = useRef(state);
  stateRef.current = state;

  const routeSearchRef = useRef(routeSearch);
  routeSearchRef.current = routeSearch;

  /**
   * Tracked reactively so the dialogue can grey out Save the moment a hand-over
   * lands while it's already open; also guards the save handlers below from
   * firing `closeActiveJob` after the lock flipped to read-only.
   */
  const persistGate = useActiveJobPersistGate(state);
  const canPersistRef = useRef(persistGate.canPersist);
  canPersistRef.current = persistGate.canPersist;

  /** Navigation flow */
  const pendingNavigationResolveRef = useRef(null);
  const pendingNavRef = useRef(null);
  /** Release-request flow */
  const pendingReleaseResolveRef = useRef(null);
  const pendingReleaseTargetRef = useRef(null);

  /** Which flow currently owns the dialogue (drives the copy + resolver) */
  const [dialogueMode, setDialogueMode] = useState("navigation");
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  const [leaveSaving, setLeaveSaving] = useState(false);
  const [nextJobName, setNextJobName] = useState(null);

  /**
   * Send the holder away from the edit page after a release-flow save/discard
   * mirrors {@link ../saveIcon.jsx}'s post-save routing. Lands on the parent
   * group when one is in the route search; falls back to the planner. Called
   * after the lock has been handed over so the unmount cleanup is a no-op.
   */
  const yieldLocksForCurrentEditJob = useCallback(async () => {
    const search = routeSearchRef.current ?? {};
    await yieldEditJobDocumentLocksOnLeave({
      jobID: routeJobID,
      groupID: search.activeGroup,
    });
  }, [routeJobID]);

  const navigateAfterRelease = useCallback(() => {
    const search = routeSearchRef.current ?? {};
    const groupID = search.activeGroup;
    const activeJob = stateRef.current?.activeJob;
    if (groupID) {
      navigate({
        to: "/group/$groupID",
        params: { groupID },
        search: buildGroupSearchAfterEditClose(search, activeJob?.jobID),
      });
      return;
    }
    navigate({ to: "/jobplanner" });
  }, [navigate]);

  const closeDialogueState = useCallback(() => {
    setNextJobName(null);
    setLeaveConfirmOpen(false);
  }, []);

  const handleLeaveCancel = useCallback(() => {
    if (dialogueMode === "release_request") {
      const resolve = pendingReleaseResolveRef.current;
      pendingReleaseResolveRef.current = null;
      pendingReleaseTargetRef.current = null;
      closeDialogueState();
      // Cancelled handover → tell the slice to dismiss the snackbar / clear the
      // pendingAccessRequest flag (i.e. treat the request as denied).
      resolve?.("cancelled");
      return;
    }
    pendingNavigationResolveRef.current?.("cancelled");
    pendingNavigationResolveRef.current = null;
    pendingNavRef.current = null;
    closeDialogueState();
  }, [closeDialogueState, dialogueMode]);

  const handleLeaveDiscard = useCallback(async () => {
    if (dialogueMode === "release_request") {
      const resolve = pendingReleaseResolveRef.current;
      const target = pendingReleaseTargetRef.current;
      if (!resolve || !target) return;
      const { updateOrAddJobsToJobArray } =
        useUsersStore.getState().jobData.actions;
      const { handOverEditAccess } =
        useUsersStore.getState().documentLock.actions;
      updateOrAddJobsToJobArray(backupJobRef.current);
      // Hand the lock over BEFORE we navigate; the new holder is already a
      // queued waitlist entry server-side, so we mustn't unmount through the
      // neutral-release path (`/release` instead of `/hand-over`).
      try {
        await handOverEditAccess(target.collection, target.docID);
      } catch {
        /* server-side hand-over already publishes the event; ignore */
      }
      await yieldLocksForCurrentEditJob();
      pendingReleaseResolveRef.current = null;
      pendingReleaseTargetRef.current = null;
      setActiveJobID(null);
      navigateAfterRelease();
      closeDialogueState();
      resolve("proceed");
      return;
    }

    const resolve = pendingNavigationResolveRef.current;
    const pending = pendingNavRef.current;
    if (!resolve || !pending) return;
    const { updateOrAddJobsToJobArray } = useUsersStore.getState().jobData.actions;
    updateOrAddJobsToJobArray(backupJobRef.current);
    await yieldLocksForCurrentEditJob();
    setActiveJobID(null);
    navigate({
      to: "/editjob/$jobID",
      params: { jobID: pending.jobID },
      search: pending.search,
    });
    closeJobDependencyTreeDialogue();
    pendingNavigationResolveRef.current = null;
    pendingNavRef.current = null;
    closeDialogueState();
    resolve("navigated");
  }, [
    backupJobRef,
    closeDialogueState,
    dialogueMode,
    navigate,
    navigateAfterRelease,
    setActiveJobID,
    yieldLocksForCurrentEditJob,
  ]);

  const handleLeaveSave = useCallback(async () => {
    if (dialogueMode === "release_request") {
      const resolve = pendingReleaseResolveRef.current;
      const target = pendingReleaseTargetRef.current;
      if (!resolve || !target) return;
      if (!canPersistRef.current) return;
      setLeaveSaving(true);
      try {
        const s = stateRef.current;
        await closeActiveJob(
          s.activeJob,
          s.jobModified,
          s.temporaryChildJobs,
          s.esiDataToLink,
          s.parentChildToEdit,
          queryClient
        );
        const { handOverEditAccess } =
          useUsersStore.getState().documentLock.actions;
        try {
          await handOverEditAccess(target.collection, target.docID);
        } catch {
          /* ignore */
        }
        await yieldLocksForCurrentEditJob();
        pendingReleaseResolveRef.current = null;
        pendingReleaseTargetRef.current = null;
        navigateAfterRelease();
        closeDialogueState();
        resolve("proceed");
      } finally {
        setLeaveSaving(false);
      }
      return;
    }

    const resolve = pendingNavigationResolveRef.current;
    const pending = pendingNavRef.current;
    if (!resolve || !pending) return;
    // Belt-and-braces: even though the dialogue disables Save when locked, the
    // lock can flip between dialogue-open and the click (server-side cascade or
    // hand-over). Refuse to call `closeActiveJob` against a doc we don't own.
    if (!canPersistRef.current) return;
    setLeaveSaving(true);
    try {
      const s = stateRef.current;
      await closeActiveJob(
        s.activeJob,
        s.jobModified,
        s.temporaryChildJobs,
        s.esiDataToLink,
        s.parentChildToEdit,
        queryClient
      );
      await yieldLocksForCurrentEditJob();
      navigate({
        to: "/editjob/$jobID",
        params: { jobID: pending.jobID },
        search: pending.search,
      });
      closeJobDependencyTreeDialogue();
      pendingNavigationResolveRef.current = null;
      pendingNavRef.current = null;
      closeDialogueState();
      resolve("navigated");
    } finally {
      setLeaveSaving(false);
    }
  }, [
    closeDialogueState,
    dialogueMode,
    navigate,
    navigateAfterRelease,
    queryClient,
    yieldLocksForCurrentEditJob,
  ]);

  useEffect(() => {
    registerEditJobNavigateHandler((payload) => {
      return new Promise((resolve) => {
        const s = stateRef.current;
        if (!s.activeJob) {
          resolve("not-handled");
          return;
        }
        const activeId = String(s.activeJob.jobID);
        const targetId = String(payload.jobID);
        if (activeId === targetId) {
          resolve("cancelled");
          return;
        }
        const rawPayloadSearch =
          payload.search && typeof payload.search === "object" ? payload.search : {};
        const navSearch = mergeEditJobNavigationSearch(
          rawPayloadSearch,
          routeSearchRef.current
        );

        if (!s.jobModified) {
          void (async () => {
            await yieldEditJobDocumentLocksOnLeave({
              jobID: routeJobID,
              groupID: routeSearchRef.current?.activeGroup,
            });
            setActiveJobID(null);
            navigate({
              to: "/editjob/$jobID",
              params: { jobID: targetId },
              search: navSearch,
            });
            closeJobDependencyTreeDialogue();
            resolve("navigated");
          })();
          return;
        }

        const nextJob = useUsersStore
          .getState()
          .jobData.actions.findJobInJobArray(targetId);
        setNextJobName(nextJob?.name ?? null);

        pendingNavigationResolveRef.current = resolve;
        pendingNavRef.current = { jobID: targetId, search: navSearch };
        setDialogueMode("navigation");
        setLeaveConfirmOpen(true);
      });
    });
    return () => {
      if (pendingNavigationResolveRef.current) {
        pendingNavigationResolveRef.current("cancelled");
        pendingNavigationResolveRef.current = null;
      }
      pendingNavRef.current = null;
      setNextJobName(null);
      setLeaveConfirmOpen(false);
      unregisterEditJobNavigateHandler();
    };
  }, [navigate, setActiveJobID]);

  useEffect(() => {
    registerEditJobReleaseRequestHandler((payload) => {
      return new Promise((resolve) => {
        const s = stateRef.current;
        if (!s.activeJob || !payload?.collection || !payload?.docID) {
          resolve("not-handled");
          return;
        }
        // If we're already in the navigation dialogue, deny the release request
        // rather than hijack the user's open prompt — they can still try to
        // hand over after they finish their navigation choice.
        if (
          pendingNavigationResolveRef.current ||
          pendingReleaseResolveRef.current
        ) {
          resolve("cancelled");
          return;
        }
        // No unsaved changes → no point opening the dialogue; let the slice
        // proceed with the hand-over directly.
        if (!s.jobModified) {
          resolve("not-handled");
          return;
        }
        pendingReleaseResolveRef.current = resolve;
        pendingReleaseTargetRef.current = {
          collection: payload.collection,
          docID: payload.docID,
        };
        setDialogueMode("release_request");
        setNextJobName(null);
        setLeaveConfirmOpen(true);
      });
    });
    return () => {
      if (pendingReleaseResolveRef.current) {
        pendingReleaseResolveRef.current("cancelled");
        pendingReleaseResolveRef.current = null;
      }
      pendingReleaseTargetRef.current = null;
      unregisterEditJobReleaseRequestHandler();
    };
  }, []);

  return {
    leaveConfirmDialogueProps: {
      open: leaveConfirmOpen,
      onClose: handleLeaveCancel,
      onDiscard: handleLeaveDiscard,
      onSave: handleLeaveSave,
      leaveSaving,
      currentJobName: state.activeJob?.name ?? "",
      nextJobName,
      mode: dialogueMode,
      // Navigation mode is the only path that can hit the dialogue on a read-only
      // job (release_request implies we still hold the lock).
      saveDisabled: dialogueMode === "navigation" && !persistGate.canPersist,
    },
  };
}

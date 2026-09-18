import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import { restoreJobIfStillHeld } from "../../../Functions/JobPlanner/restoreJobIfStillHeld.js";
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

  /**
   * Tracked reactively so the dialogue can grey out Save the moment a hand-over
   * lands while it's already open; also guards the save handlers below from
   * firing `closeActiveJob` after the lock flipped to read-only.
   */
  const persistGate = useActiveJobPersistGate(state);

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
    const search = routeSearch ?? {};
    await yieldEditJobDocumentLocksOnLeave({
      jobID: routeJobID,
      groupID: search.activeGroup,
    });
  }, [routeJobID, routeSearch]);

  const navigateAfterRelease = useCallback(() => {
    const search = routeSearch ?? {};
    const groupID = search.activeGroup;
    const activeJob = state?.activeJob;
    if (groupID) {
      navigate({
        to: "/group/$groupID",
        params: { groupID },
        search: buildGroupSearchAfterEditClose(search, activeJob?.jobID),
      });
      return;
    }
    navigate({ to: "/jobplanner" });
  }, [navigate, routeSearch, state]);

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
      const { handOverEditAccess } =
        useUsersStore.getState().documentLock.actions;
      restoreJobIfStillHeld(backupJobRef.current);
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
    restoreJobIfStillHeld(backupJobRef.current);
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
      if (!persistGate.canPersist) return;
      setLeaveSaving(true);
      try {
        const s = state;
        await closeActiveJob(
          s.activeJob,
          s.jobModified,
          s.temporaryChildJobs,
          s.esiDataToLink,
          s.parentChildToEdit,
          queryClient,
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
    if (!persistGate.canPersist) return;
    setLeaveSaving(true);
    try {
      const s = state;
      await closeActiveJob(
        s.activeJob,
        s.jobModified,
        s.temporaryChildJobs,
        s.esiDataToLink,
        s.parentChildToEdit,
        queryClient,
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
    persistGate.canPersist,
    queryClient,
    state,
    yieldLocksForCurrentEditJob,
  ]);

  // Registered once and left alone: the cleanup below answers whatever is
  // pending, so re-running this would cancel a prompt the reader is looking
  // at. The event reads the job and the route as they are when it is asked.
  const onNavigationRequested = useEffectEvent((payload, resolve) => {
    const s = state;
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
      payload.search && typeof payload.search === "object"
        ? payload.search
        : {};
    const navSearch = mergeEditJobNavigationSearch(
      rawPayloadSearch,
      routeSearch,
    );

    if (!s.jobModified) {
      void (async () => {
        await yieldEditJobDocumentLocksOnLeave({
          jobID: routeJobID,
          groupID: routeSearch?.activeGroup,
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

  useEffect(() => {
    registerEditJobNavigateHandler(
      (payload) =>
        new Promise((resolve) => {
          onNavigationRequested(payload, resolve);
        }),
    );
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

  // Registered once, for the same reason as the navigation handler above.
  const onReleaseRequested = useEffectEvent((payload, resolve) => {
    const s = state;
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

  useEffect(() => {
    registerEditJobReleaseRequestHandler(
      (payload) =>
        new Promise((resolve) => {
          onReleaseRequested(payload, resolve);
        }),
    );
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

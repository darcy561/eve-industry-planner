import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import { leaveEditedJobWhereItStands } from "../../../Functions/JobPlanner/editSessionLifetime.js";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import useUsersStore from "../../../Zustand/usersStore";
import { saveOpenJob } from "./saveOpenJob";
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
import { jobDraftNow, useJobDraft, useJobModified } from "./useJobDraft";

/**
 * Asks the reader to save or discard before the edit page navigates to another job or hands its
 * lock to a session that requested it.
 */
export function useEditJobLeaveConfirm() {
  const queryClient = useQueryClient();
  const navigate = useNavigate({ from: "/editjob/$jobID" });
  const { jobID: routeJobID } = useParams({ from: "/editjob/$jobID" });
  const routeSearch = useSearch({ from: "/editjob/$jobID" });
  const openJobName = useJobDraft((job) => job.name);
  const jobModified = useJobModified();

  const persistGate = useActiveJobPersistGate();

  const pendingNavigationResolveRef = useRef(null);
  const pendingNavRef = useRef(null);
  const pendingReleaseResolveRef = useRef(null);
  const pendingReleaseTargetRef = useRef(null);

  const [dialogueMode, setDialogueMode] = useState("navigation");
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  const [leaveSaving, setLeaveSaving] = useState(false);
  const [nextJobName, setNextJobName] = useState(null);

  const yieldLocksForCurrentEditJob = useCallback(async () => {
    await yieldEditJobDocumentLocksOnLeave({ jobID: routeJobID });
  }, [routeJobID]);

  const navigateAfterRelease = useCallback(() => {
    const search = routeSearch ?? {};
    const groupID = search.activeGroup;
    if (groupID) {
      navigate({
        to: "/group/$groupID",
        params: { groupID },
        search: buildGroupSearchAfterEditClose(search, routeJobID),
      });
      return;
    }
    navigate({ to: "/jobplanner" });
  }, [navigate, routeSearch, routeJobID]);

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
      leaveEditedJobWhereItStands();
      await handOverEditAccess(target.collection, target.docID).catch(() => {});
      await yieldLocksForCurrentEditJob();
      pendingReleaseResolveRef.current = null;
      pendingReleaseTargetRef.current = null;
      navigateAfterRelease();
      closeDialogueState();
      resolve("proceed");
      return;
    }

    const resolve = pendingNavigationResolveRef.current;
    const pending = pendingNavRef.current;
    if (!resolve || !pending) return;
    leaveEditedJobWhereItStands();
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
  }, [
    closeDialogueState,
    dialogueMode,
    navigate,
    navigateAfterRelease,
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
        if ((await saveOpenJob(queryClient)) === "kept-open") {
          pendingReleaseResolveRef.current = null;
          pendingReleaseTargetRef.current = null;
          closeDialogueState();
          resolve("cancelled");
          return;
        }
        const { handOverEditAccess } =
          useUsersStore.getState().documentLock.actions;
        await handOverEditAccess(target.collection, target.docID).catch(
          () => {},
        );
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
    if (!persistGate.canPersist) return;
    setLeaveSaving(true);
    try {
      if ((await saveOpenJob(queryClient)) === "kept-open") {
        pendingNavigationResolveRef.current = null;
        pendingNavRef.current = null;
        closeDialogueState();
        resolve("cancelled");
        return;
      }
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
    yieldLocksForCurrentEditJob,
  ]);

  const onNavigationRequested = useEffectEvent((payload, resolve) => {
    const openJob = jobDraftNow();
    if (!openJob) {
      resolve("not-handled");
      return;
    }
    const activeId = String(openJob.jobID);
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

    if (!jobModified) {
      void (async () => {
        await yieldEditJobDocumentLocksOnLeave({ jobID: routeJobID });
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
  }, [navigate]);

  const onReleaseRequested = useEffectEvent((payload, resolve) => {
    if (!jobDraftNow() || !payload?.collection || !payload?.docID) {
      resolve("not-handled");
      return;
    }
    if (
      pendingNavigationResolveRef.current ||
      pendingReleaseResolveRef.current
    ) {
      resolve("cancelled");
      return;
    }
    if (!jobModified) {
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
      currentJobName: openJobName ?? "",
      nextJobName,
      mode: dialogueMode,
      saveDisabled: dialogueMode === "navigation" && !persistGate.canPersist,
    },
  };
}

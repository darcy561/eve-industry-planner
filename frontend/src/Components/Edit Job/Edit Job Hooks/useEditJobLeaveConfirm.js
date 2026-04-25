import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import useUsersStore from "../../../Zustand/usersStore";
import closeActiveJob from "../../../Functions/JobPlanner/closeActiveJob";
import {
  registerEditJobNavigateHandler,
  unregisterEditJobNavigateHandler,
} from "../../../Events/editJobNavigationEvents";
import { closeJobDependencyTreeDialog } from "../../../Events/jobDependencyTreeDialogEvents";
import { mergeEditJobNavigationSearch } from "./mergeEditJobNavigationSearch";

/**
 * Registers {@link requestEditJobNavigation} while edit job is mounted and exposes props for
 * {@link EditJobLeaveConfirmDialog}. Merges route `activeGroup` / `pageView` into navigation
 * when callers omit them (e.g. link tree double-click from a group session).
 *
 * @param {{ backupJobRef: import("react").MutableRefObject<unknown>, state: object }} params
 */
export function useEditJobLeaveConfirm({ backupJobRef, state }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate({ from: "/editjob/$jobID" });
  const routeSearch = useSearch({ from: "/editjob/$jobID" });
  const { setActiveJobID } = useUsersStore.getState().jobData.actions;

  const stateRef = useRef(state);
  stateRef.current = state;

  const routeSearchRef = useRef(routeSearch);
  routeSearchRef.current = routeSearch;

  const pendingNavigationResolveRef = useRef(null);
  const pendingNavRef = useRef(null);
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  const [leaveSaving, setLeaveSaving] = useState(false);
  const [nextJobName, setNextJobName] = useState(null);

  const handleLeaveCancel = useCallback(() => {
    pendingNavigationResolveRef.current?.("cancelled");
    pendingNavigationResolveRef.current = null;
    pendingNavRef.current = null;
    setNextJobName(null);
    setLeaveConfirmOpen(false);
  }, []);

  const handleLeaveDiscard = useCallback(() => {
    const resolve = pendingNavigationResolveRef.current;
    const pending = pendingNavRef.current;
    if (!resolve || !pending) return;
    const { updateOrAddJobsToJobArray } = useUsersStore.getState().jobData.actions;
    updateOrAddJobsToJobArray(backupJobRef.current);
    setActiveJobID(null);
    navigate({
      to: "/editjob/$jobID",
      params: { jobID: pending.jobID },
      search: pending.search,
    });
    closeJobDependencyTreeDialog();
    pendingNavigationResolveRef.current = null;
    pendingNavRef.current = null;
    setNextJobName(null);
    setLeaveConfirmOpen(false);
    resolve("navigated");
  }, [navigate, setActiveJobID, backupJobRef]);

  const handleLeaveSave = useCallback(async () => {
    const resolve = pendingNavigationResolveRef.current;
    const pending = pendingNavRef.current;
    if (!resolve || !pending) return;
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
      navigate({
        to: "/editjob/$jobID",
        params: { jobID: pending.jobID },
        search: pending.search,
      });
      closeJobDependencyTreeDialog();
      pendingNavigationResolveRef.current = null;
      pendingNavRef.current = null;
      setNextJobName(null);
      setLeaveConfirmOpen(false);
      resolve("navigated");
    } finally {
      setLeaveSaving(false);
    }
  }, [navigate, queryClient]);

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
          setActiveJobID(null);
          navigate({
            to: "/editjob/$jobID",
            params: { jobID: targetId },
            search: navSearch,
          });
          closeJobDependencyTreeDialog();
          resolve("navigated");
          return;
        }

        const nextJob = useUsersStore
          .getState()
          .jobData.actions.findJobInJobArray(targetId);
        setNextJobName(nextJob?.name ?? null);

        pendingNavigationResolveRef.current = resolve;
        pendingNavRef.current = { jobID: targetId, search: navSearch };
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

  return {
    leaveConfirmDialogProps: {
      open: leaveConfirmOpen,
      onClose: handleLeaveCancel,
      onDiscard: handleLeaveDiscard,
      onSave: handleLeaveSave,
      leaveSaving,
      currentJobName: state.activeJob?.name ?? "",
      nextJobName,
    },
  };
}

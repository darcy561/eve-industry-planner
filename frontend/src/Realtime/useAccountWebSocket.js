import { useEffect } from "react";
import useUsersStore from "../Zustand/usersStore.js";
import {
  connectRealtime,
  disconnectRealtime,
  stashRealtimeSessionResumeHint,
} from "./realtimeClient.js";
import { scheduleDebouncedAccountDocumentsSync } from "../Functions/Debounce/accountSingletonsSyncSchedule.js";
import { fetchPlannerJobDocumentsFromApi } from "../Functions/Endpoints/Pirivate/jobDocuments.js";

/**
 * Account-scoped WebSocket lifecycle: connect when the user has a valid app session
 * (`isLoggedIn` + `sessionID` + `accountId`), disconnect otherwise; optional
 * session-resume handoff on teardown.
 * Subscribes to `visibilitychange` to re-sync account singletons and planner jobs
 * when a background tab becomes visible. Effect deps are narrow primitives to limit
 * reconnect storms.
 */
export function useAccountWebSocket() {
  const accountID = useUsersStore((s) => s.account.accountID);
  const isLoggedIn = useUsersStore((s) => s.account.isLoggedIn);

  useEffect(() => {
    if (!isLoggedIn || !accountID) {
      disconnectRealtime();
      return;
    }

    connectRealtime({ accountId: accountID });

    return () => {
      stashRealtimeSessionResumeHint();
      disconnectRealtime();
    };
  }, [isLoggedIn, accountID]);

  /** Background tabs throttle timers / WS; refresh tokens when due, then re-sync data. */
  useEffect(() => {
    if (!isLoggedIn || !accountID) {
      return;
    }
    let wakeTimer = null;
    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      if (wakeTimer != null) {
        clearTimeout(wakeTimer);
      }
      wakeTimer = window.setTimeout(() => {
        wakeTimer = null;
        void (async () => {
          const logged = useUsersStore.getState().account.isLoggedIn;
          const acc = useUsersStore.getState().account.accountID;
          if (!logged || !acc) return;

          const { runTabVisibleAuthRefresh } =
            useUsersStore.getState().account.actions;
          if (typeof runTabVisibleAuthRefresh === "function") {
            await runTabVisibleAuthRefresh();
          }

          if (!useUsersStore.getState().account.isLoggedIn) {
            return;
          }

          scheduleDebouncedAccountDocumentsSync();
          await fetchPlannerJobDocumentsFromApi().catch(() => {});
        })();
      }, 800);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      if (wakeTimer != null) {
        clearTimeout(wakeTimer);
      }
    };
  }, [isLoggedIn, accountID]);
}

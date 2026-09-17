import { useEffect } from "react";
import useUsersStore from "../Zustand/usersStore.js";
import {
  connectWebsocket,
  disconnectWebsocket,
  stashWebsocketSessionResumeHint,
} from "./websocketClient.js";
import { scheduleDebouncedAccountDocumentsSync } from "../Functions/Debounce/accountSingletonsSyncSchedule.js";
import { loadPlannerDocuments } from "../Functions/DocumentLoad/loadPlannerDocuments.js";

/**
 * Account-scoped WebSocket lifecycle: connect when the user has a valid app session
 * (`isLoggedIn` + `sessionID` + `accountId`), disconnect otherwise; optional
 * session-resume handoff on teardown.
 * Subscribes to `visibilitychange` to re-sync account singletons and planner jobs
 * when a background tab becomes visible. No auth work happens here: tokens are acquired by
 * whatever needs one. Effect deps are narrow primitives to limit reconnect storms.
 */
export function useAccountWebSocket() {
  const accountID = useUsersStore((s) => s.account.accountID);
  const isLoggedIn = useUsersStore((s) => s.account.isLoggedIn);

  useEffect(() => {
    if (!isLoggedIn || !accountID) {
      disconnectWebsocket();
      return;
    }

    connectWebsocket({ accountId: accountID });

    return () => {
      stashWebsocketSessionResumeHint();
      disconnectWebsocket();
    };
  }, [isLoggedIn, accountID]);

  /** A background tab's socket is throttled, so re-sync account data when it becomes visible. */
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

          scheduleDebouncedAccountDocumentsSync();
          await loadPlannerDocuments().catch(() => {});
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

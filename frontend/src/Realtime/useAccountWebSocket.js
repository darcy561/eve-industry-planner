import { useEffect } from "react";
import { getEffectiveAppAccessExpiryUnix } from "../Functions/Auth/appJwt.js";
import useUsersStore from "../Zustand/usersStore.js";
import {
  connectRealtime,
  disconnectRealtime,
  stashRealtimeSessionResumeHint,
} from "./realtimeClient.js";
import { scheduleDebouncedAccountDocumentsSync } from "../Functions/Debounce/accountSingletonsSyncSchedule.js";
import { fetchPlannerJobDocumentsFromApi } from "../Functions/Endpoints/Pirivate/jobDocuments.js";

/** Re-open /ws shortly before JWT expiry so the subprotocol carries a fresh token (server validates on upgrade only). */
const WS_RECONNECT_BEFORE_EXP_SEC = 90;

/**
 * Account-scoped WebSocket lifecycle: connect when the user has a valid app session
 * (`isLoggedIn` + JWT + `accountId`), disconnect otherwise; pre-expiry reconnect so
 * the wire carries a non-expired token; optional session-resume handoff on teardown.
 * Subscribes to `visibilitychange` to re-sync account singletons and planner jobs
 * when a background tab becomes visible. Effect deps are narrow primitives to limit
 * reconnect storms.
 */
export function useAccountWebSocket() {
  const accessToken = useUsersStore((s) => s.account.accessToken);
  const accessTokenEXP = useUsersStore((s) => s.account.accessTokenEXP);
  const accountID = useUsersStore((s) => s.account.accountID);
  const isLoggedIn = useUsersStore((s) => s.account.isLoggedIn);

  useEffect(() => {
    if (!isLoggedIn || !accessToken || !accountID) {
      disconnectRealtime();
      return;
    }

    connectRealtime({ accessToken, accountId: accountID });

    return () => {
      stashRealtimeSessionResumeHint();
      disconnectRealtime();
    };
  }, [isLoggedIn, accessToken, accountID]);

  useEffect(() => {
    if (!isLoggedIn || !accessToken || !accountID) {
      return;
    }
    const nowSec = Math.floor(Date.now() / 1000);
    const expSec = getEffectiveAppAccessExpiryUnix(accessToken, accessTokenEXP);
    if (expSec == null || !Number.isFinite(expSec) || expSec <= 0) {
      return;
    }
    const delayMs = Math.max(
      5000,
      (expSec - WS_RECONNECT_BEFORE_EXP_SEC - nowSec) * 1000
    );
    const id = window.setTimeout(() => {
      const tok = useUsersStore.getState().account.accessToken;
      const acc = useUsersStore.getState().account.accountID;
      const logged = useUsersStore.getState().account.isLoggedIn;
      if (logged && tok && acc) {
        connectRealtime({ accessToken: tok, accountId: acc });
      }
    }, delayMs);
    return () => clearTimeout(id);
  }, [isLoggedIn, accessToken, accessTokenEXP, accountID]);

  /** Background tabs throttle timers / WS; re-align singletons + planner after the tab is visible again. */
  useEffect(() => {
    if (!isLoggedIn || !accessToken || !accountID) {
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
        const logged = useUsersStore.getState().account.isLoggedIn;
        const tok = useUsersStore.getState().account.accessToken;
        const acc = useUsersStore.getState().account.accountID;
        if (!logged || !tok || !acc) return;
        scheduleDebouncedAccountDocumentsSync();
        void fetchPlannerJobDocumentsFromApi().catch(() => {});
      }, 800);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      if (wakeTimer != null) {
        clearTimeout(wakeTimer);
      }
    };
  }, [isLoggedIn, accessToken, accountID]);
}

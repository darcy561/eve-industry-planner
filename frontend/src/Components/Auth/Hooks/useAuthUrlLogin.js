import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCharacterHooks } from "../../../Hooks/React Query/useCharacterHooks";
import { runAppLogin } from "../../../Functions/Auth/appLoginFlow.js";
import {
  redirectToFullEveLogin,
  redirectToFullEveLoginIfTerminal,
} from "../../../Functions/Auth/plannerSessionRedirect.js";
import {
  getAuthCallbackParams,
  storeOriginalPathFromOAuthState,
  tryCompleteAdditionalAccountImportWindow,
} from "../authCallbackParams.js";
import {
  getTabPlannerRefreshToken,
  hasResumablePlannerSession,
} from "../../../Functions/Auth/tabSessionStorage.js";
import { hasCloudOAuthStorageServerHint } from "../../../Functions/Auth/plannerAuthCookies.js";

/**
 * One-shot: OAuth `code`, localStorage `Auth`, per-tab sessionStorage resume, or EVE SSO redirect.
 */
export function useAuthUrlLogin() {
  const queryClient = useQueryClient();
  const { triggerCharacterDataPrefetch, prefetchMultipleCharacters } =
    useCharacterHooks();
  const loginStartedRef = useRef(false);

  useEffect(() => {
    if (loginStartedRef.current) {
      return;
    }
    loginStartedRef.current = true;

    async function tryCookieCloudResume() {
      if (!getTabPlannerRefreshToken() && !hasCloudOAuthStorageServerHint()) {
        return false;
      }
      await runAppLogin({
        queryClient,
        prefetchMultipleCharacters,
        triggerCharacterDataPrefetch,
        mode: { type: "cookieCloudResume" },
      });
      return true;
    }

    async function tryEveClientRefresh(eveClientRefreshToken) {
      await runAppLogin({
        queryClient,
        prefetchMultipleCharacters,
        triggerCharacterDataPrefetch,
        mode: {
          type: "eveClientRefresh",
          eveClientRefreshToken,
        },
      });
      return true;
    }

    async function run() {
      const { authCode, state } = getAuthCallbackParams();
      if (tryCompleteAdditionalAccountImportWindow(state, authCode)) {
        return;
      }
      storeOriginalPathFromOAuthState(state);

      if (authCode) {
        try {
          await runAppLogin({
            queryClient,
            prefetchMultipleCharacters,
            triggerCharacterDataPrefetch,
            mode: { type: "oauthCode", authCode },
          });
        } catch (err) {
          console.error(err?.message ?? err);
          redirectToFullEveLogin();
        }
        return;
      }

      if (!hasResumablePlannerSession()) {
        redirectToFullEveLogin();
        return;
      }

      const existingAuth = localStorage.getItem("Auth");
      const hasLocalEsiRefresh =
        typeof existingAuth === "string" && existingAuth.trim().length > 0;

      // Cloud accounts drop localStorage Auth after persisting ESI server-side.
      if (!hasLocalEsiRefresh) {
        try {
          if (await tryCookieCloudResume()) {
            return;
          }
        } catch (err) {
          console.error("Tab session resume failed:", err);
          if (redirectToFullEveLoginIfTerminal(err)) {
            return;
          }
        }
        redirectToFullEveLogin();
        return;
      }

      // Local account: stored ESI refresh must succeed; tab-only resume cannot replace it.
      try {
        if (await tryEveClientRefresh(existingAuth)) {
          return;
        }
      } catch (err) {
        console.error("Session login failed:", err);
        if (redirectToFullEveLoginIfTerminal(err)) {
          return;
        }
      }

      redirectToFullEveLogin();
    }
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once; login flow is idempotent and must not re-run on hook identity
  }, []);
}

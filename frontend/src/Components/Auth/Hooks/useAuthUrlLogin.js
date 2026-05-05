import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCharacterHooks } from "../../../Hooks/React Query/useCharacterHooks";
import { runAppLogin } from "../../../Functions/Auth/appLoginFlow.js";
import redirectToEveSSO from "../Functions/eveSSORedirect";
import {
  getAuthCallbackParams,
  storeOriginalPathFromOAuthState,
  tryCompleteAdditionalAccountImportWindow,
} from "../authCallbackParams.js";

/**
 * One-shot: OAuth `code`, localStorage `Auth`, HttpOnly app refresh cookie + server-side Mongo ESI (cloud reload),
 * or EVE SSO redirect.
 */
export function useAuthUrlLogin() {
  const queryClient = useQueryClient();
  const { triggerCharacterDataPrefetch, prefetchMultipleCharacters } =
    useCharacterHooks();

  useEffect(() => {
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
          redirectToEveSSO();
        }
        return;
      }

      const existingAuth = localStorage.getItem("Auth");
      if (existingAuth) {
        try {
          await runAppLogin({
            queryClient,
            prefetchMultipleCharacters,
            triggerCharacterDataPrefetch,
            mode: {
              type: "eveClientRefresh",
              eveClientRefreshToken: existingAuth,
            },
          });
        } catch (err) {
          console.error("Session login failed:", err);
          redirectToEveSSO();
        }
        return;
      }

      try {
        await runAppLogin({
          queryClient,
          prefetchMultipleCharacters,
          triggerCharacterDataPrefetch,
          mode: { type: "cookieCloudResume" },
        });
        return;
      } catch {
        /* No cookie session or not cloud / Mongo ESI missing — full SSO */
      }

      redirectToEveSSO();
    }
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once; login flow is idempotent and must not re-run on hook identity
  }, []);
}

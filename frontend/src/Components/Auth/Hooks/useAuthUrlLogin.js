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
 * One-shot: process `/auth?code=…` (new login) or existing `Auth` localStorage (session refresh), or send user to EVE SSO.
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
      redirectToEveSSO();
    }
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once; login flow is idempotent and must not re-run on hook identity
  }, []);
}

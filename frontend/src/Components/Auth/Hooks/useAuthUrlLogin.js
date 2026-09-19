import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { resumeStoredSession } from "../../../Functions/Auth/resumeStoredSession.js";
import { runAppLogin } from "../../../Functions/Auth/appLoginFlow.js";
import { redirectToFullEveLogin } from "../../../Functions/Auth/plannerSessionRedirect.js";
import { tryCompleteAdditionalAccountImportWindow } from "../additionalAccountImport.js";
import { getAuthCallbackParams } from "../oauthUrlParams.js";

/**
 * One-shot: OAuth `code`, localStorage `Auth`, per-tab sessionStorage resume, or EVE SSO redirect.
 */
export function useAuthUrlLogin() {
  const queryClient = useQueryClient();
  const loginStartedRef = useRef(false);

  useEffect(() => {
    if (loginStartedRef.current) {
      return;
    }
    loginStartedRef.current = true;

    async function run() {
      const { authCode, state } = getAuthCallbackParams();
      if (await tryCompleteAdditionalAccountImportWindow(state, authCode)) {
        return;
      }
      if (authCode) {
        try {
          await runAppLogin({
            queryClient,
            mode: { type: "oauthCode", authCode },
          });
        } catch (err) {
          console.error(err?.message ?? err);
          await redirectToFullEveLogin().catch((redirectErr) => {
            console.error(redirectErr?.message ?? redirectErr);
          });
        }
        return;
      }

      if ((await resumeStoredSession({ queryClient })) === "rebuilt") {
        return;
      }

      // Carries where the guard was sending them, so signing in returns them to the
      // page they asked for rather than to `/auth`.
      await redirectToFullEveLogin(state);
    }
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once; login flow is idempotent and must not re-run on hook identity
  }, []);
}

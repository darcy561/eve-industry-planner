import { useEffect, useRef } from "react";
import { emitLoginComplete, LOGIN_STEPS } from "../../../Events/loginEvents";
import { getRedirectPathAfterAuth } from "../../../utils/routeUtils";
import useUsersStore from "../../../Zustand/usersStore";

/**
 * When every {@link LOGIN_STEPS} has completed, emit login complete, consume `originalPath` once, and navigate away from `/auth`.
 * @param {object} p
 * @param {Set<string|number|symbol>} p.completedSteps
 * @param {import("@tanstack/react-router").UseNavigateResult} p.navigate
 */
export function useAfterLoginStepNavigation({ completedSteps, navigate }) {
  const hasNavigated = useRef(false);

  useEffect(() => {
    const allStepsDone = Object.values(LOGIN_STEPS).every((step) =>
      completedSteps.has(step)
    );
    if (!hasNavigated.current && allStepsDone) {
      hasNavigated.current = true;
      emitLoginComplete();

      const originalPath = localStorage.getItem("originalPath");
      if (originalPath) {
        localStorage.removeItem("originalPath");
      }
      const state = useUsersStore.getState();
      const needsFirstLoginFlow =
        state.account.actions.getRequiresFirstLoginFlow();
      const redirectPath = needsFirstLoginFlow
        ? "/first-login"
        : getRedirectPathAfterAuth(originalPath, "/dashboard");
      navigate({ to: redirectPath });
    }
  }, [completedSteps, navigate]);
}

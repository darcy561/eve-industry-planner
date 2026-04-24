import { UserLogInUI } from "./LoginUI/LoginUI";
import { useNavigate } from "@tanstack/react-router";
import { useLoginState } from "./Hooks/useLoginState";
import { useAuthUrlLogin } from "./Hooks/useAuthUrlLogin";
import { useAfterLoginStepNavigation } from "./Hooks/useAfterLoginStepNavigation";

/**
 * `/auth` route: EVE OAuth callback, optional `Auth` token re-login, then navigation after async login steps complete.
 */
export default function AuthMainUser() {
  const { completedSteps } = useLoginState();
  const navigate = useNavigate({ from: "/auth" });

  useAuthUrlLogin();
  useAfterLoginStepNavigation({ completedSteps, navigate });

  return <UserLogInUI />;
}

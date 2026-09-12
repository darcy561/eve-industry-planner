import { runAppLogin } from "./appLoginFlow.js";
import { startLogin, whenLoginComplete } from "./loginProgress.js";
import { enforceReauthDemand } from "./plannerSessionRedirect.js";
import { hasResumablePlannerSession } from "./tabSessionStorage.js";

/**
 * Rebuilds a session the browser already holds credentials for, and waits until the
 * planner has the data to draw.
 *
 * Only a fresh sign-in has to leave the app; this is a token exchange followed by a
 * download, so it runs wherever the reader already is. It resolves on the login's
 * steps, not on `runAppLogin`, because that returns once the reader is authenticated
 * with the job and group data still arriving.
 *
 * A reader the server wants signed in again leaves for EVE rather than being reported
 * back, so there is no such outcome below: the tab is already going.
 *
 * `"failed"` and `"no-session"` are kept apart because a caller has to treat them
 * differently — a reader who had a session and lost it is asked to sign in again,
 * while one who never had a session belongs on a public page signed out.
 *
 * @param {Object} p
 * @param {import("@tanstack/react-query").QueryClient} p.queryClient
 * @returns {Promise<"rebuilt" | "failed" | "no-session">}
 */
export async function resumeStoredSession({ queryClient }) {
  if (enforceReauthDemand()) return "failed";
  if (!hasResumablePlannerSession()) return "no-session";

  const storedEsiRefresh = localStorage.getItem("Auth");
  const hasLocalEsiRefresh =
    typeof storedEsiRefresh === "string" && storedEsiRefresh.trim().length > 0;

  // A cloud account drops the local ESI refresh once the server holds it, so the
  // absence of one is what says to resume from the tab and the cookie instead.
  const mode = hasLocalEsiRefresh
    ? { type: "eveClientRefresh", eveClientRefreshToken: storedEsiRefresh }
    : { type: "cookieCloudResume" };

  startLogin();
  try {
    await runAppLogin({ queryClient, mode });
  } catch (error) {
    console.error("Session resume failed:", error);
    enforceReauthDemand(error);
    return "failed";
  }

  await whenLoginComplete();
  return "rebuilt";
}

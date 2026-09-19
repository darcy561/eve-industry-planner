/**
 * Whether this reader has to sign in again, and the redirect that acts on it.
 */
import redirectToEveSSO from "../../Components/Auth/Functions/eveSSORedirect";
import { isReauthRequired } from "./esiCredentials/errors.js";
import { clearPlannerAuthCookiesClientSide } from "./plannerAuthCookies.js";
import {
  clearTabPlannerSession,
  isPlannerReauthDeadlinePassed,
} from "./tabSessionStorage.js";
import { startSignIn } from "./signInState.js";

/** API auth codes that require a fresh EVE SSO login (not rotate/bootstrap). */
export const PLANNER_TERMINAL_AUTH_CODES = new Set([
  "reauth_required",
  "session_revoked",
]);

/**
 * @param {string} text
 * @returns {string|null}
 */
export function parsePlannerAuthCodeFromText(text) {
  if (typeof text !== "string" || text.trim().length === 0) {
    return null;
  }
  try {
    const json = JSON.parse(text);
    if (typeof json?.code === "string" && json.code.trim()) {
      return json.code.trim();
    }
  } catch {
    /* plain-text or non-JSON body */
  }
  for (const code of PLANNER_TERMINAL_AUTH_CODES) {
    if (text.includes(code)) {
      return code;
    }
  }
  if (text.includes("session_missing")) {
    return "session_missing";
  }
  return null;
}

/**
 * @param {Response} response
 * @returns {Promise<string|null>}
 */
export async function parsePlannerAuthCodeFromResponse(response) {
  if (!response) {
    return null;
  }
  const text = await response
    .clone()
    .text()
    .catch(() => "");
  return parsePlannerAuthCodeFromText(text);
}

/**
 * @param {string|null|undefined} code
 * @returns {boolean}
 */
export function isTerminalPlannerAuthCode(code) {
  return typeof code === "string" && PLANNER_TERMINAL_AUTH_CODES.has(code);
}

/**
 * Clears tab session + client-readable auth cookies, then navigates to EVE SSO.
 *
 * Minted before anything is cleared, so a sign-in that cannot start leaves the tab
 * as it was.
 *
 * @param {string} [returnTo] - Where the reader was headed, when they were sent here
 *   from somewhere other than the page they wanted.
 * @returns {Promise<void>} Resolves only if the redirect could not be started; the
 *   tab is gone otherwise.
 */
export async function redirectToFullEveLogin(returnTo) {
  await startSignIn();
  clearTabPlannerSession();
  clearPlannerAuthCookiesClientSide();
  redirectToEveSSO(returnTo);
}

/**
 * @param {unknown} err
 * @returns {boolean}
 */
export function errorIndicatesTerminalPlannerAuth(err) {
  if (isTerminalPlannerAuthCode(err?.code)) {
    return true;
  }
  const msg = String(err?.message ?? err ?? "");
  for (const code of PLANNER_TERMINAL_AUTH_CODES) {
    if (msg.includes(code)) {
      return true;
    }
  }
  return false;
}

/**
 * The deadline is read first and with no signal at all, so a session the server has
 * already timed out is a demand in its own right rather than something each caller
 * remembers to test separately.
 *
 * @param {unknown} [signal] - A `Response`'s parsed code, an `Error` (planner or ESI
 *   credential), a raw API code string, or nothing to ask about the deadline alone.
 * @returns {boolean}
 */
export function reauthDemand(signal) {
  if (isPlannerReauthDeadlinePassed()) return true;
  if (signal == null) return false;
  if (isReauthRequired(signal)) return true;

  const code =
    typeof signal === "string"
      ? signal
      : typeof signal?.code === "string"
        ? signal.code
        : null;
  return (
    isTerminalPlannerAuthCode(code) || errorIndicatesTerminalPlannerAuth(signal)
  );
}

/**
 * Acts on a reauth demand: clears what this tab holds and leaves for EVE SSO.
 *
 * Callers do not choose between this and {@link redirectToFullEveLogin} — a demand
 * always means a full sign-in, because the material a rotate would need is exactly
 * what is no longer valid.
 *
 * Still synchronous although the sign-in now begins with a request: the answer is
 * that this tab is leaving, which is all a caller acts on.
 *
 * @param {unknown} [signal] - As {@link reauthDemand}.
 * @returns {boolean} True when the reader is being sent to EVE.
 */
export function enforceReauthDemand(signal) {
  if (!reauthDemand(signal)) return false;
  void redirectToFullEveLogin().catch((err) => {
    console.error("Unable to start sign in:", err?.message ?? err);
  });
  return true;
}

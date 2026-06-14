/**
 * Full EVE SSO redirect when the planner session chain is no longer valid.
 * @fileoverview
 */
import redirectToEveSSO from "../../Components/Auth/Functions/eveSSORedirect";
import { clearPlannerAuthCookiesClientSide } from "./plannerAuthCookies.js";
import { clearTabPlannerSession } from "./tabSessionStorage.js";

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
  const text = await response.clone().text().catch(() => "");
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
 */
export function redirectToFullEveLogin() {
  clearTabPlannerSession();
  clearPlannerAuthCookiesClientSide();
  redirectToEveSSO();
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
 * When the server reports a terminal planner auth state, start full EVE SSO immediately.
 * @param {unknown} errOrCode - Error with `.code` or a raw API code string
 * @returns {boolean} True when a redirect was triggered
 */
export function redirectToFullEveLoginIfTerminal(errOrCode) {
  const code =
    typeof errOrCode === "string"
      ? errOrCode
      : typeof errOrCode?.code === "string"
        ? errOrCode.code
        : null;
  if (isTerminalPlannerAuthCode(code) || errorIndicatesTerminalPlannerAuth(errOrCode)) {
    redirectToFullEveLogin();
    return true;
  }
  return false;
}

/**
 * Planner auth cookie names/paths — keep in sync with `services/api/helper/auth/*_cookie.go`.
 *
 * HttpOnly cookies (`eip_session`, `eip_app_refresh`) are cleared by the server on
 * `POST /api/v1/auth/sessions/logout` (Set-Cookie Max-Age=0). The browser only applies
 * those clears when the logout request uses `credentials: "same-origin"`.
 *
 * `eip_esi_oauth_storage` is readable from JS; clear it client-side on sign-out as well.
 */

export const EIP_SESSION_COOKIE = "eip_session";
export const EIP_APP_REFRESH_COOKIE = "eip_app_refresh";
export const EIP_ESI_OAUTH_STORAGE_COOKIE = "eip_esi_oauth_storage";

export const EIP_SESSION_COOKIE_PATH = "/";
export const EIP_APP_REFRESH_COOKIE_PATH = "/api/v1/auth";
export const EIP_ESI_OAUTH_STORAGE_COOKIE_PATH = "/";

const EIP_ESI_OAUTH_STORAGE_SERVER = "server";

function secureCookieSuffix() {
  return typeof window !== "undefined" && window.location.protocol === "https:"
    ? "; Secure"
    : "";
}

/**
 * Expire a cookie the browser can write (non-HttpOnly). Ignored for HttpOnly names.
 * @param {string} name
 * @param {string} path
 */
export function expireClientCookie(name, path) {
  if (typeof document === "undefined") {
    return;
  }
  const secure = secureCookieSuffix();
  document.cookie = `${name}=; Path=${path}; Max-Age=0; SameSite=Lax${secure}`;
}

/**
 * Clears client-readable planner auth cookies (ESI OAuth storage hint).
 * Call on sign-out after attempting server logout so cold-reload guards do not treat the user as cloud-resumable.
 */
export function clearClientReadablePlannerAuthCookies() {
  expireClientCookie(EIP_ESI_OAUTH_STORAGE_COOKIE, EIP_ESI_OAUTH_STORAGE_COOKIE_PATH);
}

/**
 * Best-effort expiry for all known planner auth cookie names/paths.
 * HttpOnly rows are only removed when the server logout response is processed.
 */
export function clearPlannerAuthCookiesClientSide() {
  clearClientReadablePlannerAuthCookies();
  expireClientCookie(EIP_SESSION_COOKIE, EIP_SESSION_COOKIE_PATH);
  expireClientCookie(EIP_APP_REFRESH_COOKIE, EIP_APP_REFRESH_COOKIE_PATH);
}

/**
 * @returns {boolean}
 */
export function hasCloudOAuthStorageServerHint() {
  if (typeof document === "undefined") {
    return false;
  }
  const parts = document.cookie.split(";");
  for (const part of parts) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq === -1) {
      continue;
    }
    const name = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (name === EIP_ESI_OAUTH_STORAGE_COOKIE && value === EIP_ESI_OAUTH_STORAGE_SERVER) {
      return true;
    }
  }
  return false;
}

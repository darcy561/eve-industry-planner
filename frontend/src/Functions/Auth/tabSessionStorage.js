/**
 * Per-tab planner session credentials (`sessionStorage` — not shared across browser tabs).
 * Sent to the API as `X-Session-ID` and on `/ws` as `planner_session_id` query param.
 *
 * @fileoverview Tab-scoped planner session_id + refresh token persistence
 */

export const TAB_SESSION_ID_KEY = "eip_tab_session_id";
export const TAB_REFRESH_TOKEN_KEY = "eip_tab_refresh_token";
export const TAB_REFRESH_TOKEN_EXP_KEY = "eip_tab_refresh_token_exp";

/** @returns {boolean} */
function hasSessionStorage() {
  return typeof sessionStorage !== "undefined";
}

/**
 * @returns {string|null}
 */
export function getTabPlannerSessionID() {
  if (!hasSessionStorage()) {
    return null;
  }
  const v = sessionStorage.getItem(TAB_SESSION_ID_KEY);
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

/**
 * @returns {string|null}
 */
export function getTabPlannerRefreshToken() {
  if (!hasSessionStorage()) {
    return null;
  }
  const v = sessionStorage.getItem(TAB_REFRESH_TOKEN_KEY);
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

/**
 * @returns {number|null}
 */
export function getTabPlannerRefreshTokenExp() {
  if (!hasSessionStorage()) {
    return null;
  }
  const raw = sessionStorage.getItem(TAB_REFRESH_TOKEN_EXP_KEY);
  if (raw == null || raw === "") {
    return null;
  }
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {object} [partial]
 * @param {string|null} [partial.sessionID]
 * @param {string|null} [partial.refreshToken]
 * @param {number|null} [partial.refreshTokenEXP]
 */
export function persistTabPlannerSession(partial) {
  if (!hasSessionStorage() || !partial) {
    return;
  }
  if (partial.sessionID !== undefined) {
    const sid =
      typeof partial.sessionID === "string" && partial.sessionID.trim()
        ? partial.sessionID.trim()
        : "";
    if (sid) {
      sessionStorage.setItem(TAB_SESSION_ID_KEY, sid);
    } else {
      sessionStorage.removeItem(TAB_SESSION_ID_KEY);
    }
  }
  if (partial.refreshToken !== undefined) {
    const rt =
      typeof partial.refreshToken === "string" && partial.refreshToken.trim()
        ? partial.refreshToken.trim()
        : "";
    if (rt) {
      sessionStorage.setItem(TAB_REFRESH_TOKEN_KEY, rt);
    } else {
      sessionStorage.removeItem(TAB_REFRESH_TOKEN_KEY);
    }
  }
  if (partial.refreshTokenEXP !== undefined) {
    if (
      partial.refreshTokenEXP != null &&
      Number.isFinite(Number(partial.refreshTokenEXP))
    ) {
      sessionStorage.setItem(
        TAB_REFRESH_TOKEN_EXP_KEY,
        String(partial.refreshTokenEXP)
      );
    } else {
      sessionStorage.removeItem(TAB_REFRESH_TOKEN_EXP_KEY);
    }
  }
}

/**
 * @param {object} authResponse - Login / bootstrap / rotate JSON
 */
export function persistTabPlannerSessionFromAuthResponse(authResponse) {
  if (!authResponse || typeof authResponse !== "object") {
    return;
  }
  const sessionID =
    typeof authResponse.session_id === "string" && authResponse.session_id.trim()
      ? authResponse.session_id.trim()
      : null;
  const refreshToken =
    typeof authResponse.refresh_token === "string" &&
    authResponse.refresh_token.trim()
      ? authResponse.refresh_token.trim()
      : null;
  const refreshTokenEXP =
    authResponse.refresh_token_exp ??
    authResponse.refresh_token_expires_at ??
    null;

  persistTabPlannerSession({
    ...(sessionID && { sessionID }),
    ...(refreshToken && { refreshToken }),
    ...(refreshTokenEXP != null && { refreshTokenEXP: refreshTokenEXP }),
  });
}

/** Clears this tab's planner session material only (not EVE `localStorage` Auth). */
export function clearTabPlannerSession() {
  if (!hasSessionStorage()) {
    return;
  }
  sessionStorage.removeItem(TAB_SESSION_ID_KEY);
  sessionStorage.removeItem(TAB_REFRESH_TOKEN_KEY);
  sessionStorage.removeItem(TAB_REFRESH_TOKEN_EXP_KEY);
}

/**
 * Headers for auth session endpoints and private API (`X-Session-ID`).
 * @returns {Record<string, string>}
 */
export function tabPlannerSessionRequestHeaders() {
  const sid = getTabPlannerSessionID();
  return sid ? { "X-Session-ID": sid } : {};
}

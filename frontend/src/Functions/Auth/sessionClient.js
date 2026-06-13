import withRequestRetries from "../Endpoints/withRequestRetries.js";
import requestWithPrivateHeaders from "../Endpoints/Pirivate/applyPrivateHeaders.js";
import { clearPlannerAuthCookiesClientSide } from "./plannerAuthCookies.js";
import {
  clearTabPlannerSession,
  getTabPlannerRefreshToken,
  tabPlannerSessionRequestHeaders,
  persistTabPlannerSessionFromAuthResponse,
} from "./tabSessionStorage.js";

const AUTH_SESSIONS = "/api/v1/auth/sessions";
const AUTH_SESSIONS_ROTATE = "/api/v1/auth/sessions/rotate";
const AUTH_SESSIONS_BOOTSTRAP = "/api/v1/auth/sessions/bootstrap";
const AUTH_SESSIONS_LOGOUT = "/api/v1/auth/sessions/logout";

function getAppVersionHeaderValue() {
  if (typeof __APP_VERSION__ === "string" && __APP_VERSION__.trim().length > 0) {
    return __APP_VERSION__;
  }
  return "unknown";
}

function authSessionHeaders(extra = {}) {
  return {
    "Content-Type": "application/json",
    "X-App-Version": getAppVersionHeaderValue(),
    ...tabPlannerSessionRequestHeaders(),
    ...extra,
  };
}

/** Initial planner session from EVE SSO access JWT (`POST /api/v1/auth/sessions`). */
export async function establishPlannerSession(eveSSOToken) {
  const response = await withRequestRetries(() =>
    fetch(AUTH_SESSIONS, {
      method: "POST",
      credentials: "same-origin",
      headers: authSessionHeaders(),
      body: JSON.stringify({ token: eveSSOToken }),
    })
  );
  if (!response.ok) {
    throw new Error(`Failed to fetch server session: ${response.status} ${response.statusText}`);
  }
  const json = await response.json();
  persistTabPlannerSessionFromAuthResponse(json);
  return json;
}

/**
 * Periodic planner session rotate (`POST .../rotate`). Response `kind`: `session_rotate`.
 * Per-tab `refresh_token` in body + `X-Session-ID` header.
 */
export async function rotatePlannerSession(refreshToken, eveSSOToken) {
  const body = { eve_token: eveSSOToken };
  const rt = refreshToken || getTabPlannerRefreshToken();
  if (rt) {
    body.refresh_token = rt;
  }
  const response = await withRequestRetries(() =>
    fetch(AUTH_SESSIONS_ROTATE, {
      method: "POST",
      credentials: "same-origin",
      headers: authSessionHeaders(),
      body: JSON.stringify(body),
    })
  );
  if (!response.ok) {
    throw new Error(`Failed to refresh server session: ${response.status} ${response.statusText}`);
  }
  const json = await response.json();
  persistTabPlannerSessionFromAuthResponse(json);
  return json;
}

/**
 * Bootstrap planner session with hydrated account docs (`POST .../bootstrap`).
 */
export async function bootstrapPlannerSession(refreshToken, eveSSOToken) {
  const body = { eve_token: eveSSOToken };
  const rt = refreshToken || getTabPlannerRefreshToken();
  if (rt) {
    body.refresh_token = rt;
  }
  const response = await withRequestRetries(() =>
    fetch(AUTH_SESSIONS_BOOTSTRAP, {
      method: "POST",
      credentials: "same-origin",
      headers: authSessionHeaders(),
      body: JSON.stringify(body),
    })
  );
  if (!response.ok) {
    throw new Error(
      `Failed to refresh server session for login: ${response.status} ${response.statusText}`
    );
  }
  const json = await response.json();
  persistTabPlannerSessionFromAuthResponse(json);
  return json;
}

/**
 * Logout this tab's planner session (revokes Redis row for tab refresh token).
 */
export async function logoutPlannerSession(refreshToken) {
  const rt = refreshToken || getTabPlannerRefreshToken();
  try {
    const response = await requestWithPrivateHeaders(
      AUTH_SESSIONS_LOGOUT,
      {
        method: "POST",
        credentials: "same-origin",
        headers: authSessionHeaders(),
        body: JSON.stringify(rt ? { refresh_token: rt } : {}),
      },
      {
        requestName: "logoutPlannerSession",
        retry: false,
        skipSessionRefresh: true,
      }
    );
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTabPlannerSession();
    clearPlannerAuthCookiesClientSide();
  }
}

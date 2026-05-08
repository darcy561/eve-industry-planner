import withRequestRetries from "../Endpoints/withRequestRetries.js";
import requestWithPrivateHeaders from "../Endpoints/Pirivate/applyPrivateHeaders.js";

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

/** Initial planner session from EVE SSO access JWT (`POST /api/v1/auth/sessions`). */
export async function establishPlannerSession(eveSSOToken) {
  const response = await withRequestRetries(() =>
    fetch(AUTH_SESSIONS, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        "X-App-Version": getAppVersionHeaderValue(),
      },
      body: JSON.stringify({ token: eveSSOToken }),
    })
  );
  if (!response.ok) {
    throw new Error(`Failed to fetch server session: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

/** Periodic planner session rotate (`POST .../rotate`). Response `kind`: `session_rotate`. */
export async function rotatePlannerSession(refreshToken, eveSSOToken) {
  const body = { eve_token: eveSSOToken };
  if (refreshToken) {
    body.refresh_token = refreshToken;
  }
  const response = await withRequestRetries(() =>
    fetch(AUTH_SESSIONS_ROTATE, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        "X-App-Version": getAppVersionHeaderValue(),
      },
      body: JSON.stringify(body),
    })
  );
  if (!response.ok) {
    throw new Error(`Failed to refresh server session: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

/**
 * Bootstrap planner session with hydrated account docs (`POST .../bootstrap`).
 */
export async function bootstrapPlannerSession(refreshToken, eveSSOToken) {
  const body = { eve_token: eveSSOToken };
  if (refreshToken) {
    body.refresh_token = refreshToken;
  }
  const response = await withRequestRetries(() =>
    fetch(AUTH_SESSIONS_BOOTSTRAP, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        "X-App-Version": getAppVersionHeaderValue(),
      },
      body: JSON.stringify(body),
    })
  );
  if (!response.ok) {
    throw new Error(
      `Failed to refresh server session for login: ${response.status} ${response.statusText}`
    );
  }
  return response.json();
}

/**
 * Logout planner session (private route when refresh token is not HttpOnly-only edge cases).
 */
export async function logoutPlannerSession(refreshToken) {
  try {
    const response = await requestWithPrivateHeaders(
      AUTH_SESSIONS_LOGOUT,
      {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "X-App-Version": getAppVersionHeaderValue(),
        },
        body: JSON.stringify(refreshToken ? { refresh_token: refreshToken } : {}),
      },
      { requestName: "logoutPlannerSession" }
    );
    return response.ok;
  } catch {
    return false;
  }
}

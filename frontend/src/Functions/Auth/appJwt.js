/**
 * App-internal JWT (`account.accessToken`): decode, expiry, JWKS verification, and helpers.
 * Not for EVE SSO / ESI access tokens (those stay in Character / ESI modules).
 */

import { createRemoteJWKSet, customFetch, decodeJwt, jwtVerify } from "jose";
import { fetchWithPublicHeaders } from "../Endpoints/Public/applyPublicHeaders.js";

/** Public path for RS256 key material; must match `services/api/apiServer.go`. */
export const APP_JWT_JWKS_PATH = "/api/v1/auth/jwks";

/** jose → fetch bridge: same public headers and retries as other app API fetches. */
function fetchJwksWithAppPublicStack(url, init) {
  const headerObj =
    init.headers && typeof init.headers.forEach === "function"
      ? Object.fromEntries(init.headers)
      : { ...init.headers };
  return fetchWithPublicHeaders(
    url,
    {
      method: init.method,
      headers: headerObj,
      redirect: init.redirect,
      signal: init.signal,
    },
    { requestName: "appJwtJwks" }
  );
}

/** @type {ReturnType<typeof createRemoteJWKSet>|null} */
let appJwtRemoteJWKSet = null;

/**
 * Remote JWKS for verifying app access tokens (cached by jose; keyed to current origin).
 * @returns {ReturnType<typeof createRemoteJWKSet>}
 */
export function getAppJwtRemoteJWKSet() {
  if (!appJwtRemoteJWKSet) {
    const base =
      typeof window !== "undefined" && window.location?.origin
        ? window.location.origin
        : "http://127.0.0.1";
    appJwtRemoteJWKSet = createRemoteJWKSet(new URL(APP_JWT_JWKS_PATH, base), {
      [customFetch]: fetchJwksWithAppPublicStack,
    });
  }
  return appJwtRemoteJWKSet;
}

/**
 * Verifies the app JWT signature and standard time claims using keys from {@link APP_JWT_JWKS_PATH}.
 * Call after login/refresh before storing `access_token` in client state.
 *
 * @param {string} accessToken - raw JWT from `/api/v1/auth/sessions` or `/api/v1/auth/sessions/refresh`
 * @returns {Promise<import("jose").JWTPayload>}
 */
export async function verifyAppAccessTokenWithJwks(accessToken) {
  if (!accessToken || typeof accessToken !== "string") {
    throw new Error("App access token missing");
  }
  const { payload } = await jwtVerify(accessToken, getAppJwtRemoteJWKSet(), {
    algorithms: ["RS256"],
    clockTolerance: APP_JWT_EXPIRY_SKEW_SEC,
  });
  return payload;
}

/** Default skew when comparing `exp` to wall clock (seconds). */
export const APP_JWT_EXPIRY_SKEW_SEC = 60;

/**
 * @param {string|null|undefined} token - raw JWT string
 * @returns {import("jose").JWTPayload|null}
 */
export function decodeAppJwt(token) {
  if (!token || typeof token !== "string") return null;
  try {
    return decodeJwt(token);
  } catch {
    return null;
  }
}

/**
 * @param {string|null|undefined} token
 * @returns {number|null} JWT `exp` in seconds since epoch, or null if missing/invalid
 */
export function getAppJwtExpiryUnix(token) {
  const payload = decodeAppJwt(token);
  const exp = payload?.exp;
  if (typeof exp !== "number" || !Number.isFinite(exp)) return null;
  return exp;
}

/**
 * @param {string|null|undefined} token
 * @returns {string|null} JWT `session_id` claim, or null if missing/invalid
 */
export function getAppJwtSessionID(token) {
  const payload = decodeAppJwt(token);
  const sessionID = payload?.session_id;
  if (typeof sessionID !== "string" || sessionID.trim().length === 0) return null;
  return sessionID.trim();
}

/**
 * @param {string|null|undefined} token
 * @param {number} [skewSec] - treat as expired this many seconds before `exp`
 * @returns {boolean} true if unusable (missing payload, missing exp, malformed, or past exp minus skew)
 */
export function isAppJwtExpired(token, skewSec = APP_JWT_EXPIRY_SKEW_SEC) {
  const exp = getAppJwtExpiryUnix(token);
  if (exp == null) return true;
  const now = Math.floor(Date.now() / 1000);
  const skew = Number.isFinite(skewSec) && skewSec >= 0 ? skewSec : APP_JWT_EXPIRY_SKEW_SEC;
  return now >= exp - skew;
}

/**
 * Seconds until access token expiry for scheduling (e.g. WS reconnect before `exp`).
 * Uses session `accessTokenEXP` from the API when numeric and positive; otherwise JWT `exp`.
 *
 * @param {string|null|undefined} accessToken
 * @param {number|string|undefined|null} accessTokenEXP - `account.accessTokenEXP` from Zustand
 * @returns {number|null}
 */
export function getEffectiveAppAccessExpiryUnix(accessToken, accessTokenEXP) {
  const fromStore =
    typeof accessTokenEXP === "number"
      ? accessTokenEXP
      : Number(accessTokenEXP);
  if (Number.isFinite(fromStore) && fromStore > 0) {
    return fromStore;
  }
  return getAppJwtExpiryUnix(accessToken);
}

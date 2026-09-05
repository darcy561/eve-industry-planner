import { parseAdditionalAccountState } from "./additionalAccountImport.js";

/**
 * Reads the OAuth values EVE SSO returns on the callback URL.
 *
 * @param {string} [search] — default `window.location.search`
 * @returns {{ authCode: string | null, state: string | null }}
 */
export function getAuthCallbackParams(
  search = typeof window !== "undefined" ? window.location.search : ""
) {
  const urlParams = new URLSearchParams(search);
  return {
    authCode: urlParams.get("code"),
    state: urlParams.get("state"),
  };
}

/**
 * Stores post-login return path from OAuth `state`. An additional-account import carries a
 * handshake nonce there instead of a path, and must not be navigated to after login.
 *
 * @param {string | null} state
 */
export function storeOriginalPathFromOAuthState(state) {
  if (state && parseAdditionalAccountState(state) === null) {
    localStorage.setItem("originalPath", state);
  }
}

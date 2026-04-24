/** `state` for OAuth to link a character from the “Additional accounts” flow (not main login). */
export const EVE_SSO_ADDITIONAL_ACCOUNT_STATE = "additional";

/**
 * Callback tab writes the auth `code` here; the parent tab receives a `storage` event.
 * Kept in sync with `tryCompleteAdditionalAccountImportWindow` and the `/auth` flow.
 */
export const ADDITIONAL_USER_AUTH_CODE_STORAGE_KEY = "AdditionalUser";

const DEFAULT_ADDITIONAL_IMPORT_LISTENER_MS = 180_000;

/**
 * Remove `code` stashed for cross-tab additional-account import, if any.
 */
export function clearAdditionalUserAuthCode() {
  try {
    localStorage.removeItem(ADDITIONAL_USER_AUTH_CODE_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Parent window: listen for the OAuth callback tab to write
 * {@link ADDITIONAL_USER_AUTH_CODE_STORAGE_KEY} (triggers the `storage` event here).
 *
 * @param {object} opts
 * @param {(code: string) => void} opts.onAuthCode
 * @param {() => void} [opts.onTimeout] — if the code never appears (same timeout as long SSO session)
 * @param {number} [opts.timeoutMs]
 * @returns {() => void} `detach` — also called internally when a code is received
 */
export function subscribeToAdditionalUserAuthCodeFromStorage({
  onAuthCode,
  onTimeout,
  timeoutMs = DEFAULT_ADDITIONAL_IMPORT_LISTENER_MS,
}) {
  const onStorage = (event) => {
    if (event.key !== ADDITIONAL_USER_AUTH_CODE_STORAGE_KEY) return;
    const code = localStorage.getItem(ADDITIONAL_USER_AUTH_CODE_STORAGE_KEY);
    if (!code) return;
    detach();
    onAuthCode(code);
  };
  const timer = setTimeout(() => {
    if (!localStorage.getItem(ADDITIONAL_USER_AUTH_CODE_STORAGE_KEY)) {
      detach();
      onTimeout?.();
    }
  }, timeoutMs);
  function detach() {
    clearTimeout(timer);
    window.removeEventListener("storage", onStorage);
  }
  window.addEventListener("storage", onStorage);
  return detach;
}

/**
 * URL + localStorage helpers for `/auth` OAuth callback handling.
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
 * Stores post-login return path from OAuth `state` (not used for the additional-import popup).
 * @param {string | null} state
 */
export function storeOriginalPathFromOAuthState(state) {
  if (state && state !== EVE_SSO_ADDITIONAL_ACCOUNT_STATE) {
    localStorage.setItem("originalPath", state);
  }
}

/**
 * When opening EVE OAuth in a popup to link another character, the callback uses `state=additional`.
 * @param {string | null} state
 * @param {string | null} authCode
 * @returns {boolean} `true` if this request was fully handled (window closed).
 */
export function tryCompleteAdditionalAccountImportWindow(state, authCode) {
  if (state === EVE_SSO_ADDITIONAL_ACCOUNT_STATE) {
    localStorage.setItem(ADDITIONAL_USER_AUTH_CODE_STORAGE_KEY, authCode);
    window.close();
    return true;
  }
  return false;
}

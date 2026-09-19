import { fetchWithPublicHeaders } from "../Endpoints/Public/applyPublicHeaders.js";

export const SIGN_IN_STATE_ENDPOINT = "/api/v1/eve-sso/sign-in-state";
const STORAGE_KEY = "eip.sign-in-state";

/**
 * Asks the API for a sign-in state and remembers it for the callback.
 *
 * @returns {Promise<string>} The value to carry through the sign-in.
 * @throws {Error} When the API will not issue one; the sign-in must not go ahead.
 */
export async function startSignIn() {
  const response = await fetchWithPublicHeaders(
    SIGN_IN_STATE_ENDPOINT,
    { method: "POST", credentials: "same-origin" },
    { requestName: "mintSignInState" },
  );
  if (!response.ok) {
    throw new Error(`Unable to start sign in: ${response.status}`);
  }

  const { state } = await response.json();
  if (typeof state !== "string" || !state) {
    throw new Error("Unable to start sign in: no state was issued");
  }

  try {
    sessionStorage.setItem(STORAGE_KEY, state);
  } catch {
    throw new Error("Unable to start sign in: this browser will not store it");
  }
  return state;
}

/**
 * Takes the state this tab is carrying, spending it.
 *
 * @returns {string} The value, or "" when this tab did not start a sign-in.
 */
export function takeSignInState() {
  try {
    const state = sessionStorage.getItem(STORAGE_KEY) ?? "";
    sessionStorage.removeItem(STORAGE_KEY);
    return state;
  } catch {
    return "";
  }
}

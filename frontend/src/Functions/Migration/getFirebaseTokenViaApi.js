import { getRuntimeEnv } from "../../utils/runtime-config";

/**
 * Requests a Firebase custom token for the current user via the Go API migration endpoint.
 * The Go API derives the user from the JWT; this function only needs that JWT.
 *
 * @param {string} accessToken - Current JWT used with the Go API.
 * @returns {Promise<{access_token: string, isFirstTimeLogin: boolean}>}
 */
async function getFirebaseTokenViaApi(accessToken) {
  const response = await fetch(
    `/api/migration/firebase-token`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({}),
    }
  );

  if (!response.ok) {
    throw new Error(
      `Failed to generate Firebase token via API: ${response.status} ${response.statusText}`
    );
  }

  return await response.json();
}

export default getFirebaseTokenViaApi;


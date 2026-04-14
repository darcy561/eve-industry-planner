import { getToken } from "firebase/app-check";
import { appCheck, auth } from "../../firebase";
import { signInWithCustomToken } from "firebase/auth";
import { getRuntimeEnv } from "../../utils/runtime-config";
import useUsersStore from "../../Zustand/usersStore";

/**
 * Generates and signs in with a Firebase custom token using EVE SSO credentials.
 * Exchanges EVE SSO tokens for Firebase authentication tokens.
 * 
 * @param {Object} userObject - User object containing EVE SSO tokens and refresh token data
 * @returns {Promise<Object|undefined>} Promise that resolves to sign-in result with first-time login flag
 * 
 * @throws {Error} Throws error if userObject is missing or token generation fails
 * 
 * @example
 * const signInResult = await getFirebaseAuthToken(userObject);
 * if (signInResult?.isFirstTimeLogin) {
 *   console.log("First time login detected");
 * }
 */
async function getFirebaseAuthToken(userObject) {
  try {
    if (!userObject) {
      throw new Error("userObject missing");
    }
    const appCheckToken = await getToken(appCheck);

    const response = await fetch(
      `${getRuntimeEnv("API_URL")}/auth/generate-token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Firebase-AppCheck": appCheckToken.token,
          "Access-Token": userObject.esiAccessToken,
          appVersion: __APP_VERSION__,
        },
        body: JSON.stringify({
          ...userObject.getRefreshTokenObject(),
          UID: useUsersStore.getState().account.actions.getAccountID(),
        }),
      }
    );

    if (!response.ok) {
      const errorDetails = await response.json();
      console.error("Error details:", errorDetails);
      throw new Error(
        `Failed to generate Firebase token: ${errorDetails.message}`
      );
    }

    const fbTokenJSON = await response.json();
    const signInResult = await signInWithCustomToken(auth, fbTokenJSON.access_token);
    
    // Add first-time login flag to the result
    return {
      ...signInResult,
      isFirstTimeLogin: fbTokenJSON.isFirstTimeLogin || false
    };
  } catch (err) {
    console.error("Unable get Firebase Auth Token:", err.message);
    return undefined
  }
}
export default getFirebaseAuthToken;

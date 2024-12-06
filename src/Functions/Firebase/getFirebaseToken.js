import { getToken } from "firebase/app-check";
import { appCheck, auth } from "../../firebase";
import { signInWithCustomToken } from "firebase/auth";

async function getFirebaseAuthToken(userObject) {
  if (!userObject) {
    throw new Error("userObject missing");
  }
  try {
    const appCheckToken = await getToken(appCheck, true);

    const response = await fetch(
      `${import.meta.env.VITE_APIURL}/auth/gentoken`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Firebase-AppCheck": appCheckToken.token,
          "Access-Token": userObject.aToken,
          appVersion: __APP_VERSION__,
        },
        body: JSON.stringify(userObject.getRefreshTokenObject()),
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
    return await signInWithCustomToken(auth, fbTokenJSON.access_token);
  } catch (err) {
    console.error("Unable get Firebase Auth Token:", err);
  }
}
export default getFirebaseAuthToken;

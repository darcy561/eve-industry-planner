import { trace } from "firebase/performance";
import { analytics, functions, performance } from "../../firebase";
import { httpsCallable } from "firebase/functions";
import { logEvent } from "firebase/analytics";

/**
 * Builds new user data in Firebase for first-time users.
 * Calls cloud function to create initial user data and logs analytics event.
 * 
 * @param {Object} firebaseToken - Firebase authentication token
 * @returns {Promise<void>} Promise that resolves when user data is built
 * 
 * @throws {Error} Throws error if firebaseToken is missing
 * 
 * @example
 * await buildNewUserData(firebaseToken);
 * console.log("New user data created");
 */
async function buildNewUserData(firebaseToken) {
  try {
    if (!firebaseToken) {
      throw new Error("Firebase token not provided");
    }
    
    if (!firebaseToken._tokenResponse.isNewUser) return;

    const firebaseTrace = trace(performance, "NewUserCloudBuild");
    firebaseTrace.start();

    const buildCloudData = httpsCallable(
      functions,
      "createUserData-createUserData"
    );

    const characterData = await buildCloudData();

    logEvent(analytics, "newUserCreation", {
      UID: characterData.data.accountID,
    });

    firebaseTrace.stop();
  } catch (err) {
    console.error(`Failed to determine user build state: ${err}`);
  }
}

export default buildNewUserData;

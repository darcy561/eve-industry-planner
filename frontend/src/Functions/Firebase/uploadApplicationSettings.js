import { doc, updateDoc } from "firebase/firestore";
import { firestore } from "../../firebase";
import getCurrentFirebaseUser from "./currentFirebaseUser";
import useUsersStore from "../../Zustand/usersStore";
import { saveUserDocument } from "../Endpoints/Pirivate/userDocument";


/**
 * Uploads application settings and user data to Firebase Firestore.
 *
 * During migration we previously performed a dual-write to MongoDB as well,
 * but this has been disabled – application settings are now written to
 * Firebase **only** until we are ready to persist them to Mongo.
 *
 * @returns {Promise<void>} Promise that resolves when settings are uploaded
 *
 * @throws {Error} Throws error if user is not authenticated or Firebase write fails
 *
 * @example
 * await uploadApplicationSettingsToFirebase();
 * console.log("Application settings uploaded to Firebase");
 */
async function uploadApplicationSettingsToFirebase() {
  try {
    const uid = getCurrentFirebaseUser();

    if (!uid) {
      throw new Error("No authenticated user found");
    }

    // await updateDoc(doc(firestore, "Users", uid), {
    //   settings: useUsersStore
    //     .getState()
    //     .applicationSettings.actions.toDocument(),
    //   ...useUsersStore.getState().users.actions.toDocument(),
    // });

    await saveUserDocument();
  } catch (err) {
    console.error("Error uploading application settings:", err);
    throw err;
  }
}


export default uploadApplicationSettingsToFirebase;

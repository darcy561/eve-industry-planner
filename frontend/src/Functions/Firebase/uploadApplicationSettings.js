import { doc, updateDoc } from "firebase/firestore";
import { firestore } from "../../firebase";
import getCurrentFirebaseUser from "./currentFirebaseUser";
import useUsersStore from "../../Zustand/usersStore";

/**
 * Uploads application settings and user data to Firebase Firestore.
 * Updates the user document with current application settings and user information.
 * 
 * @returns {Promise<void>} Promise that resolves when settings are uploaded
 * 
 * @throws {Error} Throws error if user is not authenticated
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

    await updateDoc(doc(firestore, "Users", uid), {
      settings: useUsersStore
        .getState()
        .applicationSettings.actions.toDocument(),
      ...useUsersStore.getState().users.actions.toDocument(),
    });
  } catch (err) {
    console.error("Error uploading application settings:", err);
  }
}

export default uploadApplicationSettingsToFirebase;

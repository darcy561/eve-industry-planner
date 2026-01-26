import { doc, updateDoc } from "firebase/firestore";
import { firestore } from "../../firebase";
import getCurrentFirebaseUser from "./currentFirebaseUser";
import useUsersStore from "../../Zustand/usersStore";
import { saveUserDocumentDual } from "../Migration/userDocument.js";
import { isMongoDBWriteEnabled } from "../Migration/config.js";

/**
 * Pure Firebase write function (no dual-write, no MongoDB)
 * 
 * This is the internal Firebase write function used by the migration utilities.
 * It only writes to Firebase and does not trigger dual-write logic.
 * 
 * @returns {Promise<void>} Promise that resolves when settings are uploaded to Firebase
 * 
 * @throws {Error} Throws error if user is not authenticated or Firebase write fails
 */
async function uploadApplicationSettingsToFirebaseOnly() {
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
}

/**
 * Uploads application settings and user data to Firebase Firestore.
 * During migration, also writes to MongoDB in parallel (dual-write mode).
 * Updates the user document with current application settings and user information.
 * 
 * Uses the migration dual-write utility to handle both Firebase and MongoDB writes.
 * Firebase is primary - if it fails, the function throws.
 * MongoDB write is non-blocking during migration.
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
    // If MongoDB writes are enabled, use dual-write
    if (isMongoDBWriteEnabled()) {
      // Dual-write handles both Firebase and MongoDB
      await saveUserDocumentDual();
    } else {
      // Firebase only (fallback mode)
      await uploadApplicationSettingsToFirebaseOnly();
    }
  } catch (err) {
    console.error("Error uploading application settings:", err);
    throw err;
  }
}

// Export the pure Firebase function for use in migration utilities
export { uploadApplicationSettingsToFirebaseOnly };
export default uploadApplicationSettingsToFirebase;

import { doc, updateDoc } from "firebase/firestore";
import { firestore } from "../../firebase";
import getCurrentFirebaseUser from "./currentFirebaseUser";
import useUsersStore from "../../Zustand/usersStore";

/**
 * Uploads group data to Firebase Firestore user profile.
 * Updates the GroupData document in the user's ProfileInfo collection.
 *
 * @returns {Promise<void>} Promise that resolves when group data is uploaded
 *
 * @throws {Error} Throws error if user is not authenticated
 *
 * @example
 * await uploadGroupsToFirebase();
 * console.log("Group data uploaded to Firebase");
 */
async function uploadGroupsToFirebase() {
  try {
    const uid = getCurrentFirebaseUser();

    if (!uid) {
      throw new Error("No authenticated user found");
    }

    const groupObjects = useUsersStore
      .getState()
      .jobData.actions.getGroupArrayForFirebase();

    await updateDoc(doc(firestore, `Users/${uid}/ProfileInfo`, "GroupData"), {
      groupData: groupObjects,
    });
  } catch (err) {
    console.error(`Error uploading group data to Firebase ${err}`);
  }
}

export default uploadGroupsToFirebase;

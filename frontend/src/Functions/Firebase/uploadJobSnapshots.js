import { doc, updateDoc } from "firebase/firestore";
import getCurrentFirebaseUser from "./currentFirebaseUser";
import { firestore } from "../../firebase";
import useUsersStore from "../../Zustand/usersStore";

/**
 * Uploads job snapshots to Firebase Firestore user profile.
 * Updates the JobSnapshot document in the user's ProfileInfo collection.
 *
 * @returns {Promise<void>} Promise that resolves when snapshots are uploaded
 *
 * @throws {Error} Throws error if user is not authenticated
 *
 * @example
 * await uploadJobSnapshotsToFirebase();
 * console.log("Job snapshots uploaded to Firebase");
 */
async function uploadJobSnapshotsToFirebase(snapshotArray) {
  try {
    const uid = getCurrentFirebaseUser();

    if (!uid) {
      throw new Error("No authenticated user found");
    }

    const snapshotObjects = snapshotArray
      ? snapshotArray.map((snap) => snap.toDocument())
      : useUsersStore
          .getState()
          .jobData.actions.getUserJobSnapshotForFirebase();

    await updateDoc(doc(firestore, `Users/${uid}/ProfileInfo`, "JobSnapshot"), {
      snapshot: snapshotObjects,
    });
  } catch (err) {
    console.error("Error uploading snapshots:", err);
  }
}

export default uploadJobSnapshotsToFirebase;

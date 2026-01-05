import { firestore } from "../../firebase";
import { deleteDoc, doc } from "firebase/firestore";
import getCurrentFirebaseUser from "./currentFirebaseUser";

/**
 * Deletes a job document from Firebase Firestore.
 * 
 * @param {Object} inputJob - Job object to delete from Firebase
 * @returns {Promise<void>} Promise that resolves when job is deleted
 * 
 * @throws {Error} Throws error if inputJob is missing or user is not authenticated
 * 
 * @example
 * await deleteJobFromFirebase(job);
 * console.log("Job deleted from Firebase");
 */
async function deleteJobFromFirebase(inputJob) {
  try {
    if (!inputJob) {
      throw new Error("Input Job is null or undefined");
    }

    const uid = getCurrentFirebaseUser();

    if (!uid) {
      throw new Error("No authenticated user found");
    }

    await deleteDoc(
      doc(firestore, `Users/${uid}/Jobs`, inputJob.jobID.toString())
    );
  } catch (err) {
    console.error(`Error uploading job object to Firebase: ${err}`);
  }
}

export default deleteJobFromFirebase;

import { firestore } from "../../firebase";
import { doc, updateDoc } from "firebase/firestore";
import getCurrentFirebaseUser from "./currentFirebaseUser";

/**
 * Updates an existing job document in Firebase Firestore.
 * 
 * @param {Object} inputJob - Job object to update in Firebase
 * @returns {Promise<void>} Promise that resolves when job is updated
 * 
 * @throws {Error} Throws error if inputJob is missing or user is not authenticated
 * 
 * @example
 * job.jobName = "Updated Job Name";
 * await updateJobInFirebase(job);
 * console.log("Job updated in Firebase");
 */
async function updateJobInFirebase(inputJob) {
  try {
    if (!inputJob) {
      throw new Error("Input Job is null or undefined");
    }

    const uid = getCurrentFirebaseUser();

    if (!uid) {
      throw new Error("No authenticated user found");
    }

    await updateDoc(
      doc(firestore, `Users/${uid}/Jobs`, inputJob.jobID.toString()),
      inputJob.toDocument()
    );
  } catch (err) {
    console.error(`Error updating job object in Firebase: ${err}`);
  }
}

export default updateJobInFirebase;

import { firestore } from "../../firebase";
import { doc, setDoc } from "firebase/firestore";
import getCurrentFirebaseUser from "./currentFirebaseUser";

/**
 * Archives a job by moving it to the ArchivedJobs collection in Firebase.
 * Sets the archived flag and stores the job in the archived collection.
 * 
 * @param {Object} inputJob - Job object to archive
 * @returns {Promise<void>} Promise that resolves when job is archived
 * 
 * @throws {Error} Throws error if inputJob is missing or user is not authenticated
 * 
 * @example
 * await archiveJobInFirebase(job);
 * console.log("Job archived successfully");
 */
async function archiveJobInFirebase(inputJob) {
  try {
    if (!inputJob) {
      throw new Error("Input Job is null or undefined");
    }

    const uid = getCurrentFirebaseUser();

    if (!uid) {
      throw new Error("No authenticated user found");
    }
    inputJob.archived = true;

    setDoc(
      doc(firestore, `Users/${uid}/ArchivedJobs`, inputJob.jobID.toString()),
      inputJob.toDocument()
    );
  } catch (err) {
    console.error(`Error archiving job in Firebase: ${err}`);
  }
}

export default archiveJobInFirebase;

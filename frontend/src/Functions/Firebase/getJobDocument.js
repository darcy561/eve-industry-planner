import { firestore } from "../../firebase";
import { doc, getDoc } from "firebase/firestore";
import getCurrentFirebaseUser from "./currentFirebaseUser";
import Job from "../../Classes/jobConstructor";

/**
 * Retrieves a job document from Firebase Firestore by job ID.
 * 
 * @param {string|number} inputID - The job ID to retrieve
 * @returns {Promise<Job|null>} Promise that resolves to Job object or null if not found
 * 
 * @throws {Error} Throws error if inputID is missing or user is not authenticated
 * 
 * @example
 * const job = await getJobDocumentFromFirebase("job_123");
 * if (job) {
 *   console.log("Retrieved job:", job.jobName);
 * }
 */
async function getJobDocumentFromFirebase(inputID) {
  try {
    if (!inputID) {
      throw new Error("Input ID is null or undefined");
    }

    const uid = getCurrentFirebaseUser();

    if (!uid) {
      throw new Error("No authenticated user found");
    }

    const document = await getDoc(
      doc(firestore, `Users/${uid}/Jobs`, inputID.toString())
    );
    if (document.exists()) {
      return new Job(document.data());
    } else {
      return null
      // throw new Error("Document Not Found");
    }
  } catch (err) {
    console.error("Error getting document from Firebase:", err);
    return null;
  }
}

export default getJobDocumentFromFirebase;

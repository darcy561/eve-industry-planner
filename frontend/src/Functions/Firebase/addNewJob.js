import { firestore } from "../../firebase";
import { doc, setDoc } from "firebase/firestore";
import getCurrentFirebaseUser from "./currentFirebaseUser";

/**
 * Adds a new job document to Firebase Firestore.
 * 
 * @param {Object} inputJob - Job object to add to Firebase
 * @returns {Promise<void>} Promise that resolves when job is added
 * 
 * @throws {Error} Throws error if inputJob is missing or user is not authenticated
 * 
 * @example
 * const job = new Job(jobData);
 * await addNewJobToFirebase(job);
 * console.log("Job added to Firebase");
 */
async function addNewJobToFirebase(inputJob) {
  try {
    if (!inputJob) {
      throw new Error("Input Job is null or undefined");
    }

    const uid = getCurrentFirebaseUser();

    if (!uid) {
      throw new Error("No authenticated user found");
    }

    await setDoc(
      doc(firestore, `Users/${uid}/Jobs`, inputJob.jobID.toString()),
      inputJob.toDocument()
    );
  } catch (err) {
    console.error(`Error uploading job object to Firebase: ${err}`);
  }
}

export default addNewJobToFirebase;

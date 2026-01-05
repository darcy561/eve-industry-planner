import { doc, writeBatch } from "firebase/firestore";
import { firestore } from "../../firebase";
import getCurrentFirebaseUser from "./currentFirebaseUser";

/**
 * Updates multiple job documents in Firebase Firestore using batch operations.
 * Processes jobs in batches of 500 to comply with Firestore batch limits.
 * 
 * @param {Array<Object>} inputJobs - Array of job objects to update in Firebase
 * @returns {Promise<void>} Promise that resolves when all jobs are updated
 * 
 * @throws {Error} Throws error if inputJobs is missing or user is not authenticated
 * 
 * @example
 * const jobs = [job1, job2, job3];
 * await firebaseBatchUpdateJobs(jobs);
 * console.log("All jobs updated in Firebase");
 */
async function firebaseBatchUpdateJobs(inputJobs) {
  try {
    if (!inputJobs) {
      throw new Error("Input Jobs is null or undefined");
    }

    if (inputJobs.length === 0) {
      return;
    }

    const BATCH_SIZE = 500;

    const uid = getCurrentFirebaseUser();

    for (let i = 0; i <= inputJobs.length; i += BATCH_SIZE) {
      let batch = writeBatch(firestore);

        const batchJobs = inputJobs.slice(i, i + BATCH_SIZE);
        
      batchJobs.forEach((job) => {
        const jobRef = doc(
          firestore,
          `Users/${uid}/Jobs`,
          job.jobID.toString()
        );
        batch.set(jobRef, job.toDocument());
      });

      await batch.commit();
    }
  } catch (err) {
    console.error("Error in batch update:", err);
  }
}

export default firebaseBatchUpdateJobs;

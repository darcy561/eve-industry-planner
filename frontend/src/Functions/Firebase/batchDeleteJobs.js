import { doc, writeBatch } from "firebase/firestore";
import getCurrentFirebaseUser from "./currentFirebaseUser";
import { firestore } from "../../firebase";

/**
 * Deletes multiple job documents from Firebase Firestore using batch operations.
 * Processes jobs in batches of 500 to comply with Firestore batch limits.
 * 
 * @param {Array<Object>} inputJobs - Array of job objects to delete from Firebase
 * @returns {Promise<void>} Promise that resolves when all jobs are deleted
 * 
 * @throws {Error} Throws error if inputJobs is missing or user is not authenticated
 * 
 * @example
 * const jobs = [job1, job2, job3];
 * await firebaseBatchDeleteJobs(jobs);
 * console.log("All jobs deleted from Firebase");
 */
async function firebaseBatchDeleteJobs(inputJobs) {
  try {
    if (!inputJobs) {
      throw new Error("Input Jobs is null or undefined");
    }

    if (inputJobs.length === 0) {
      return;
    }

    const BATCH_SIZE = 500;

    const uid = getCurrentFirebaseUser();

    for (let i = 0; i < inputJobs.length; i += BATCH_SIZE) {
      let batch = writeBatch(firestore);

      const batchJobs = inputJobs.slice(i, i + BATCH_SIZE);

      batchJobs.forEach((job) => {
        const jobRef = doc(
          firestore,
          `Users/${uid}/Jobs`,
          job.jobID.toString()
        );

        batch.delete(jobRef);
      });
      await batch.commit();
    }
  } catch (err) {
    console.error("Error in batch update:", err);
  }
}

export default firebaseBatchDeleteJobs;

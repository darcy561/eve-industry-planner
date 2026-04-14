import getJobDocumentFromFirebase from "../Firebase/getJobDocument";
import isUserLoggedIn from "../Firebase/isUserLoggedIn";
import useUsersStore from "../../Zustand/usersStore";

/**
 * Finds a job object by ID from local store or fetches it from Firebase if not found.
 * Searches in the main job array first, then in an alternative job store, and finally from Firebase.
 * 
 * @param {string} requestedJobID - The ID of the job to find
 * @param {Array} [alternativeJobStore=[]] - Alternative array to search in if not found in main store
 * @returns {Promise<Object|null>} Promise that resolves to the job object or null if not found
 * 
 * @example
 * const job = await findOrGetJobObject("job_123");
 * if (job) {
 *   console.log("Found job:", job.jobName);
 * }
 */
async function findOrGetJobObject(
  requestedJobID,
  alternativeJobStore = []
) {
  const { findJobInJobArray } = useUsersStore.getState().jobData.actions;
  try {
    if (!requestedJobID) {
      throw new Error("Missing requested input");
    }

    const matchedJob = findJobInJobArray(requestedJobID) ||
      alternativeJobStore.find(({ jobID }) => jobID === requestedJobID);

    if (matchedJob) {
      return matchedJob;
    } else if (isUserLoggedIn()) {
      const retrievedJob = await getJobDocumentFromFirebase(requestedJobID);

      if (!retrievedJob) {
        return null
      }

      alternativeJobStore.push(retrievedJob);

      return retrievedJob;
    } else return null;
  } catch (err) {
    console.error("Error finding job object:", err);
    return null;
  }
}

export default findOrGetJobObject;

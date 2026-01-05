import getJobDocumentFromFirebase from "../Firebase/getJobDocument";
import isUserLoggedIn from "../Firebase/isUserLoggedIn";
import useUsersStore from "../../Zustand/usersStore";

/**
 * Retrieves job objects from Firebase that are not currently in the local job array.
 * Compares requested job IDs against existing jobs and fetches missing ones from Firebase.
 * 
 * @param {string|number|Array<string|number|Object>|Set<string|number|Object>} requestedJobIDs - Job ID(s) to check for missing objects
 * @returns {Promise<Array>} Promise that resolves to array of missing job objects from Firebase
 * 
 * @throws {Error} Throws error if requestedJobIDs is missing or invalid type
 * 
 * @example
 * const missingJobs = await getMissingJobObjects(["job_123", "job_456"]);
 * console.log(missingJobs.length); // Number of jobs fetched from Firebase
 * 
 * @example
 * const missingJobs = await getMissingJobObjects("job_123");
 * console.log(missingJobs[0].jobName); // Name of the fetched job
 */
async function getMissingJobObjects(requestedJobIDs) {
  const jobArray = useUsersStore.getState().jobData.jobArray;
  try {
    if (!requestedJobIDs) {
      throw new Error("Missing requested input");
    }

    if (!isUserLoggedIn()) {
      return [];
    }

    const jobIDs = [];

    if (Array.isArray(requestedJobIDs) || requestedJobIDs instanceof Set) {
      (Array.isArray(requestedJobIDs)
        ? requestedJobIDs
        : Array.from(requestedJobIDs)
      ).forEach((item) => {
        if (typeof item === "string" || typeof item === "number") {
          jobIDs.push(item);
        } else if (
          typeof item === "object" &&
          item !== null &&
          "jobID" in item
        ) {
          jobIDs.push(item.jobID);
        } else {
          throw new Error(
            "Array or Set item must be a string, number, or an object with an 'jobID' property."
          );
        }
      });
    } else if (
      typeof requestedJobIDs === "string" ||
      typeof requestedJobIDs === "number"
    ) {
      jobIDs.push(requestedJobIDs);
    } else {
      throw new Error(
        "Invalid type for requestedJobIDs. Must be an array, Set, or a single ID."
      );
    }

    const missingIDS = jobArray
      .map((job) => job.jobID)
      .filter((id) => !jobIDs.includes(id));

    const requests = missingIDS.map((id) => getJobDocumentFromFirebase(id));

    const results = await Promise.all(requests);

    return results.filter((result) => result !== null);
  } catch (err) {
    console.error("Error finding job objects:", err);
    return [];
  }
}

export default getMissingJobObjects;

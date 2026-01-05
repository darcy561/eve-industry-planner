import findOrGetJobObject from "./findJobObject";

/**
 * Recursively retrieves all jobs related to the input job IDs through parent-child relationships.
 * Uses a stack-based approach to traverse the job dependency tree and collect all related jobs.
 * 
 * @param {string|Array<string>|Set<string>} inputJobIDs - Job ID(s) to find related jobs for
 * @param {Array} [retrievedJobs=[]] - Array to store retrieved job objects during traversal
 * @returns {Promise<Array>} Promise that resolves to array of all related job objects
 * 
 * @throws {Error} Throws error if inputJobIDs is missing or invalid type
 * 
 * @example
 * const relatedJobs = await getAllRelatedJobs("job_123", []);
 * console.log(relatedJobs.length); // Number of related jobs found
 * 
 * @example
 * const relatedJobs = await getAllRelatedJobs(["job_123", "job_456"], []);
 * console.log(relatedJobs.length); // Number of related jobs found
 */
async function getAllRelatedJobs(inputJobIDs, retrievedJobs = []) {
  try {
    if (!inputJobIDs || !retrievedJobs) {
      throw new Error("missing input");
    }
    let stack;
    const jobIDMap = {};

    if (typeof inputJobIDs === "string") {
      stack = [inputJobIDs];
    } else if (Array.isArray(inputJobIDs)) {
      stack = inputJobIDs;
    } else if (inputJobIDs instanceof Set) {
      stack = Array.from(inputJobIDs);
    } else {
      throw new Error(
        "Invalid inputItem type. Expected a string, array, or set."
      );
    }

    while (stack.length > 0) {
      const jobID = stack.pop();
      if (jobIDMap[jobID]) continue;

      const matchedJob = await findOrGetJobObject(
        jobID,
        retrievedJobs
      );
      if (!matchedJob) continue;

      jobIDMap[jobID] = matchedJob;

      const relatedJobs = matchedJob.getRelatedJobs();
      if (relatedJobs && Array.isArray(relatedJobs)) {
        stack.push(...relatedJobs);
      }
    }

    return Object.values(jobIDMap);
  } catch (err) {
    console.error(err);
    return [];
  }
}

export default getAllRelatedJobs;

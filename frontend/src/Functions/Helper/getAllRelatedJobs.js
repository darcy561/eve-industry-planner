import useUsersStore from "../../Zustand/usersStore";

/**
 * Recursively collects all jobs related to the input job IDs through parent-child links.
 * Stack-based traversal of the dependency tree (store lookups only).
 *
 * @param {string|Array<string>|Set<string>} inputJobIDs - Root job ID(s)
 * @returns {Array<Object>} Related job objects from `jobArray`
 *
 * @throws {Error} Throws if inputJobIDs is missing or invalid type
 */

function getAllRelatedJobs(inputJobIDs) {
  try {
    if (!inputJobIDs) {
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

      const matchedJob = useUsersStore.getState().jobData.actions.findJobInJobArray(
        jobID
      );
      if (!matchedJob) continue;

      jobIDMap[jobID] = matchedJob;

      const relatedJobs = matchedJob.relatedJobIDs;

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

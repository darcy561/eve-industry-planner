import findOrGetJobObject from "./findJobObject";

/**
 * Converts job IDs to job objects by fetching them from storage or using existing objects.
 * Handles arrays, sets, single strings, or single objects as input.
 * 
 * @param {Array|Set|string|Object} inputItem - Job IDs or job objects to convert
 * @param {Array} retrievedJobs - Array to store retrieved job objects
 * @returns {Promise<Array>} Promise that resolves to array of job objects
 * 
 * @example
 * const jobObjects = await convertJobIDsToObjects(["job_123", "job_456"], []);
 * console.log(jobObjects.length); // Number of successfully retrieved jobs
 */
async function convertJobIDsToObjects(inputItem, retrievedJobs) {
  if (!inputItem || !retrievedJobs) {
    console.error("Unable to convert job ids with missing inputs");
    return;
  }
  const promises = [];
  const foundObjects = [];
  const encounteredJobIDs = new Set();

  if (Array.isArray(inputItem) || inputItem instanceof Set) {
    for (const item of inputItem) {
      if (typeof item === "string") {
        if (!item.includes("job") || encounteredJobIDs.has(item)) continue;
        promises.push(findOrGetJobObject(item, retrievedJobs));
      }
      if (typeof item === "object") {
        if (encounteredJobIDs.has(item.jobID)) continue;
        foundObjects.push(item);
      }
    }
  } else {
    if (typeof inputItem === "string") {
      if (!inputItem.includes("job")) return foundObjects;
      promises.push(findOrGetJobObject(inputItem, retrievedJobs));
    }
    if (typeof inputItem === "object") {
      foundObjects.push(inputItem);
    }
  }

  if (promises.length === 0) return foundObjects;

  const resolvedPromises = await Promise.allSettled(promises);

  const resolveObjects = resolvedPromises
    .filter((res) => res.status === "fulfilled" && res.value)
    .map((res) => res.value);

  return [...foundObjects, ...resolveObjects];
}

export default convertJobIDsToObjects;

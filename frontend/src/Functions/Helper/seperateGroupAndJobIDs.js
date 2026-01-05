/**
 * Separates group IDs and job IDs from a mixed array of identifiers.
 * Filters input items based on whether they contain "group" or "job" in their ID.
 * 
 * @param {string|Array<string>|Set<string>} inputItems - Mixed array of group and job IDs
 * @returns {Object} Object with separated groupIDs and jobIDs arrays
 * @returns {Array<string>} returns.groupIDs - Array of group IDs
 * @returns {Array<string>} returns.jobIDs - Array of job IDs
 * 
 * @example
 * const result = seperateGroupAndJobIDs(["group_123", "job_456", "group_789"]);
 * console.log(result.groupIDs); // ["group_123", "group_789"]
 * console.log(result.jobIDs); // ["job_456"]
 * 
 * @example
 * const result = seperateGroupAndJobIDs("job_123");
 * console.log(result.jobIDs); // ["job_123"]
 * console.log(result.groupIDs); // []
 */
function seperateGroupAndJobIDs(inputItems) {
  if (typeof inputItems === "string") {
    inputItems = [inputItems];
  }

  if (!Array.isArray(inputItems) && !(inputItems instanceof Set)) {
    console.error("Invalid input: expected an array, a set, or a string.");
    return { groupIDs: [], jobIDs: [] };
  }

  const inputArray =
    inputItems instanceof Set ? Array.from(inputItems) : inputItems;

  const { groupIDs, jobIDs } = inputArray.reduce(
    (acc, id) => {
      if (typeof id === "string") {
        if (id.includes("group")) {
          acc.groupIDs.add(id);
        } else if (id.includes("job")) {
          acc.jobIDs.add(id);
        }
      }
      return acc;
    },
    { groupIDs: new Set(), jobIDs: new Set() }
  );

  return {
    groupIDs: [...groupIDs],
    jobIDs: [...jobIDs],
  };
}

export default seperateGroupAndJobIDs;

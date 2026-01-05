import useUsersStore from "../../Zustand/usersStore";

/**
 * Extracts job IDs from group objects by resolving group IDs to their included job IDs.
 * Handles various input types (string, array, Set) and filters for group IDs only.
 * 
 * @param {string|Array<string>|Set<string>} inputItem - Group ID(s) to extract job IDs from
 * @returns {Array<string>} Array of unique job IDs from all specified groups
 * 
 * @example
 * const jobIDs = retrieveJobIDsFromGroupObjects("group_123");
 * console.log(jobIDs); // ["job_1", "job_2", "job_3"]
 * 
 * @example
 * const jobIDs = retrieveJobIDsFromGroupObjects(["group_123", "group_456"]);
 * console.log(jobIDs); // Combined job IDs from both groups
 */
function retrieveJobIDsFromGroupObjects(inputItem) {
  const { getGroupObject } = useUsersStore.getState().jobData.actions;
  if (!inputItem) {
    console.error(
      "Unable to retrieve job ids from groups with missing inputs."
    );
    return [];
  }

  let inputArray;

  if (typeof inputItem === "string") {
    inputArray = [inputItem];
  } else if (Array.isArray(inputItem)) {
    inputArray = inputItem;
  } else if (inputItem instanceof Set) {
    inputArray = Array.from(inputItem);
  } else {
    console.error("Invalid inputItem type. Expected a string, array, or set.");
    return [];
  }

  const jobIDs = inputArray
    .filter((id) => id.includes("group"))
    .map((id) => {
      const group = getGroupObject(id);
      return group ? [...group.includedJobIDs] : [];
    })
    .flat();

  return [...new Set(jobIDs)];
}

export default retrieveJobIDsFromGroupObjects;

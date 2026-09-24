import useUsersStore from "../../Zustand/usersStore";
import { isGroupID } from "./ids";

/**
 * Extracts job IDs from group objects by resolving group IDs to their included job IDs.
 * Handles various input types (string, array, Set) and filters for group IDs only.
 *
 * @param {string|Array<string>|Set<string>} inputItem - Group ID(s) to extract job IDs from
 * @returns {Array<string>} Array of unique job IDs from all specified groups
 */
function retrieveJobIDsFromGroupObjects(inputItem) {
  const { getGroupObject } = useUsersStore.getState().jobData.actions;
  if (!inputItem) {
    console.error(
      "Unable to retrieve job ids from groups with missing inputs.",
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
    .filter(isGroupID)
    .map((id) => {
      const group = getGroupObject(id);
      return group ? [...group.includedJobIDs] : [];
    })
    .flat();

  return [...new Set(jobIDs)];
}

export default retrieveJobIDsFromGroupObjects;

import useUsersStore from "../../Zustand/usersStore";

/**
 * Custom hook that provides functionality to manage jobs within groups in EVE Online industry planning.
 * 
 * This hook provides utilities for:
 * - Finding material job IDs within specific groups
 * - Checking if materials exist in group type IDs
 * - Retrieving job objects for materials in groups
 * 
 * The hook is designed for group-specific job management:
 * - Validates group and material ID parameters
 * - Checks if material type ID is included in group
 * - Returns job object if found, null otherwise
 * 
 * @returns {Object} Object containing group job management functions
 * @returns {Function} returns.findMaterialJobIDInGroup - Finds material job ID in specific group
 * 
 * @example
 * function GroupJobManager() {
 *   const { findMaterialJobIDInGroup } = useManageGroupJobs();
 * 
 *   const handleFindJob = (materialID, groupID) => {
 *     const job = findMaterialJobIDInGroup(materialID, groupID);
 *     if (job) {
 *       console.log("Found job:", job.jobID);
 *     } else {
 *       console.log("No job found for material in group");
 *     }
 *   };
 * 
 *   return <div>Group job management</div>;
 * }
 */
export function useManageGroupJobs() {
  const { jobArray } = useUsersStore((state) => state.jobData);
  const { getGroupObject } = useUsersStore.getState().jobData.actions;

  function findMaterialJobIDInGroup(requestedMaterialID, requestedGroupID) {
    if (!requestedMaterialID || !requestedGroupID) return null;

    const requestedGroupObject = getGroupObject(requestedGroupID);

    if (!requestedGroupObject.includedTypeIDs.has(requestedMaterialID))
      return null;

    return (
      jobArray.find(
        (i) =>
          i.groupID === requestedGroupID && i.itemID === requestedMaterialID
      ) || null
    );
  }

  return {
    findMaterialJobIDInGroup,
  };
}

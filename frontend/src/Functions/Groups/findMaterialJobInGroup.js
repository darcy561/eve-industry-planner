import useUsersStore from "../../Zustand/usersStore.js";

/**
 * Finds the planner job that produces a material item within a group (same itemID + groupID).
 *
 * @param {number|string} requestedMaterialID — material `typeID`
 * @param {string} requestedGroupID
 * @returns {import("../../Classes/job").default|null}
 */
export function findMaterialJobInGroup(requestedMaterialID, requestedGroupID) {
  if (!requestedMaterialID || !requestedGroupID) return null;

  const { getGroupObject } = useUsersStore.getState().jobData.actions;
  const { jobArray } = useUsersStore.getState().jobData;

  const requestedGroupObject = getGroupObject(requestedGroupID);

  if (!requestedGroupObject?.hasIncludedTypeId?.(requestedMaterialID))
    return null;

  return (
    jobArray.find(
      (i) =>
        i.groupID === requestedGroupID && i.itemID === requestedMaterialID
    ) || null
  );
}

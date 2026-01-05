import { acceptedDirectLocationTypes, acceptedExtendedLocationTypes } from "./assetLocationConstants";
import getWorldData from "../EveESI/World/getWorldData";
import useUsersStore from "../../Zustand/usersStore";
/**
 * Helper function to check if a location ID needs to be fetched
 * @param {number} requestedID - The location ID to check
 * @param {Set} requestSet - Set to add the ID to if it's missing
 * @param {Object} universeIDs - Existing universe IDs cache
 * @param {Object} newEveIDs - Newly fetched universe IDs
 */
function checkAndAddLocationID(requestedID, requestSet, universeIDs, newEveIDs) {
  if (!requestedID) return;

  if (!universeIDs[requestedID] && !newEveIDs[requestedID]) {
    requestSet.add(requestedID);
  }
}

/**
 * Refactored version of getAssetLocationList with improved performance and bug fixes.
 * 
 * Extracts unique location IDs from user assets, resolves missing universe IDs via API calls,
 * filters invalid/inaccessible locations, and returns a sorted list.
 * 
 * Improvements:
 * - Processes assets only once instead of per user
 * - Uses Set for O(1) duplicate checking instead of O(n) array.some()
 * - Fixed return type consistency
 * - Early return check moved outside loop
 * - Simplified sorting logic
 * 
 * @param {Array} userAssets - Array containing all assets for all users

 * @returns {Promise<{itemLocations: Array, newEveIDs: Object}>} Object with location array and universe IDs
 */
export async function getAssetLocationList(userAssets = []) {
  const { isLoggedIn, userArray, } = useUsersStore.getState().users
  const { universeIDs } = useUsersStore.getState().worldData
  try {
    // Early return check moved outside the loop
    if (!isLoggedIn || !userAssets || userAssets.length === 0) {
      return { itemLocations: [], newEveIDs: {} };
    }

    // Use Set for efficient O(1) duplicate checking
    const itemLocationsSet = new Set();
    const allMissingIDs = new Set();
    let newEveIDs = {};

    // Process assets once to collect all unique location IDs
    for (let asset of userAssets) {
      if (acceptedDirectLocationTypes.has(asset.location_type)) {
        if (asset.location_id) {
          itemLocationsSet.add(asset.location_id);
          checkAndAddLocationID(
            asset.location_id,
            allMissingIDs,
            universeIDs,
            newEveIDs
          );
        }
      }

      if (acceptedExtendedLocationTypes.has(asset.location_type)) {
        let parentLocation = retrieveAssetLocation(asset, userAssets);
        if (
          parentLocation &&
          parentLocation.location_type !== "other" &&
          parentLocation.location_id
        ) {
          itemLocationsSet.add(parentLocation.location_id);
          checkAndAddLocationID(
            parentLocation.location_id,
            allMissingIDs,
            universeIDs,
            newEveIDs
          );
        }
      }
    }

    // Convert Set to Array for further processing
    let itemLocations = Array.from(itemLocationsSet);

    // Try fetching missing IDs with each user (different users may have access to different locations)
    for (let user of userArray) {
      // Filter to only IDs that are still missing after previous user attempts
      const userMissingIDs = new Set();
      for (const id of allMissingIDs) {
        if (!universeIDs[id] && !newEveIDs[id]) {
          userMissingIDs.add(id);
        }
      }

      if (userMissingIDs.size > 0) {
        const eveIDResults = await getWorldData(userMissingIDs, user);
        newEveIDs = { ...newEveIDs, ...eveIDResults };
      }
    }

    // Filter out invalid or inaccessible locations
    itemLocations = itemLocations.filter((locationID) => {
      const itemData = newEveIDs[locationID] || universeIDs[locationID];
      return itemData && itemData.name !== "No Access To Location";
    });

    // Sort alphabetically by name (simplified comparator)
    itemLocations.sort((a, b) => {
      const aName = newEveIDs[a]?.name || universeIDs[a]?.name || "";
      const bName = newEveIDs[b]?.name || universeIDs[b]?.name || "";
      return aName.localeCompare(bName);
    });

    return { itemLocations, newEveIDs };
  } catch (err) {
    console.error(`Error in getAssetLocationList: ${err.message}`);
    return { itemLocations: [], newEveIDs: {} };
  }
}

export function retrieveAssetLocation(initialAsset, userAssets) {
  let parentAsset = userAssets.find(
    (i) => i.item_id === initialAsset.location_id
  );
  if (!parentAsset) {
    return initialAsset;
  }
  if (acceptedExtendedLocationTypes.has(parentAsset.location_type)) {
    return retrieveAssetLocation(parentAsset, userAssets);
  }
  if (acceptedDirectLocationTypes.has(parentAsset.location_type)) {
    return parentAsset;
  }
}


import { getSearchIndex } from "./getCachedData";
import { getAllCachedCharacterBlueprints } from "../../Hooks/EveEsi/Character/useGetAllCharacterBlueprints";
import { getAllCachedCorporationBlueprints } from "../../Hooks/EveEsi/Corporation/useGetAllCorporationBlueprints";

/**
 * Gets a Set of available blueprint IDs from character and corporation blueprints.
 * 
 * @param {Object} queryClient - React Query client instance
 * @returns {Set<number>} Set of blueprint type IDs that are available
 * 
 * @example
 * const availableBlueprints = getAvailableBlueprintByBlueprintID(queryClient);
 * console.log(availableBlueprints.has(12345)); // true if blueprint is available
 */
function getAvailableBlueprintByBlueprintID(
  queryClient
) {
  return sortBlueprintsIntoSet(queryClient);
}

/**
 * Gets a Set of material IDs for items that have available blueprints.
 * 
 * @param {Object} queryClient - React Query client instance
 * @returns {Promise<Set<number>>} Promise that resolves to Set of material type IDs
 * 
 * @example
 * const availableMaterials = await getAvailableBlueprintsByMaterialID(queryClient);
 * console.log(availableMaterials.has(34)); // true if Tritanium blueprint is available
 */
async function getAvailableBlueprintsByMaterialID(
  queryClient
) {
  const idSet = sortBlueprintsIntoSet(queryClient);
  const itemList = await getSearchIndex();

  const itemListAsMapByBlueprintID = itemList.reduce(
    (acc, { blueprintID, itemID }) => {
      acc[blueprintID] = itemID;
      return acc;
    },
    {}
  );

  const returnSet = new Set();

  idSet.forEach((id) => {
    if (itemListAsMapByBlueprintID[id]) {
      returnSet.add(itemListAsMapByBlueprintID[id]);
    }
  });

  return returnSet;
}

/**
 * Sorts character and corporation blueprints into a Set of type IDs.
 * 
 * @param {Object} queryClient - React Query client instance
 * @returns {Set<number>} Set of blueprint type IDs from both character and corporation blueprints
 * 
 * @private
 */
function sortBlueprintsIntoSet(queryClient) {
  const characterBlueprints = getAllCachedCharacterBlueprints(queryClient);
  const corporationBlueprints = getAllCachedCorporationBlueprints(queryClient);

  const idSet = new Set();

  // Handle character blueprints
  if (characterBlueprints && characterBlueprints.data && !characterBlueprints.isLoading && !characterBlueprints.isError) {
    for (const data of Object.values(characterBlueprints.data)) {
      if (Array.isArray(data)) {
        for (const { type_id } of data) {
          idSet.add(type_id);
        }
      }
    }
  }

  // Handle corporation blueprints
  if (corporationBlueprints && corporationBlueprints.data && !corporationBlueprints.isLoading && !corporationBlueprints.isError) {
    for (const data of Object.values(corporationBlueprints.data)) {
      if (Array.isArray(data)) {
        for (const { type_id } of data) {
          idSet.add(type_id);
        }
      }
    }
  }

  return idSet;
}

export {
  getAvailableBlueprintByBlueprintID,
  getAvailableBlueprintsByMaterialID,
};

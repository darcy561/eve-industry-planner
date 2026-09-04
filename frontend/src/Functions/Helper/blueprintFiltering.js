import { jobTypes } from "../../Context/defaultValues";

/**
 * Combines character and corporation blueprints into a single array
 *
 * @param {Object} characterBlueprints - Character blueprints data organised by character hash
 * @param {Object} corporationBlueprints - Corporation blueprints data organised by corporation ID
 * @returns {Array} Combined array of blueprints
 */
export function combineBlueprints(characterBlueprints, corporationBlueprints) {
  // Character blueprints structure: { [characterHash]: [blueprints] }
  const characterBps = Object.values(characterBlueprints || {}).flat();
  // Corporation blueprints structure: { [corporationID]: [blueprints] }
  const corporationBps = Object.values(corporationBlueprints || {}).flat();
  return [...characterBps, ...corporationBps];
}

/**
 * Sorts blueprints by quantity, material efficiency, and time efficiency
 *
 * @param {Array} blueprints - Array of blueprint objects
 * @returns {Array} Sorted array of blueprints
 */
export function sortBlueprints(blueprints) {
  return [...blueprints].sort(
    (a, b) =>
      a.quantity.toString().localeCompare(b.quantity.toString()) ||
      b.material_efficiency - a.material_efficiency ||
      b.time_efficiency - a.time_efficiency
  );
}

/**
 * Filters blueprints based on the selected filter type
 *
 * @param {Array} allBlueprints - All available blueprints
 * @param {string} filterType - Type of filter ('all', 'active', 'manufacturing', 'reactions', 'bpo', 'bpc')
 * @param {Object} options - Additional options for filtering
 * @param {Array} options.itemList - Item list for job type filtering
 * @param {Array} options.esiJobIDs - Active industry jobs for 'active' filter
 * @param {Object} options.queryClient - Query client for getting cached jobs
 * @returns {Array} Filtered array of blueprints
 */
export function filterBlueprints(allBlueprints, filterType, options = {}) {
  const { itemList, apiJobs } = options;

  switch (filterType) {
    case "all":
      return allBlueprints;

    case "active": {
      if (!apiJobs || !Array.isArray(apiJobs) || apiJobs.length === 0) return [];
      return allBlueprints.filter((blueprint) =>
        apiJobs.some(
          (job) =>
            job.blueprint_id === blueprint.item_id && job.status === "active"
        )
      );
    }

    case "manufacturing": {
      if (!itemList) return [];
      return allBlueprints.filter((blueprint) =>
        itemList.some(
          (item) =>
            item.blueprintID === blueprint.type_id &&
            item.jobType === jobTypes.manufacturing
        )
      );
    }

    case "reactions": {
      if (!itemList) return [];
      return allBlueprints.filter((blueprint) =>
        itemList.some(
          (item) =>
            item.blueprintID === blueprint.type_id &&
            item.jobType === jobTypes.reaction
        )
      );
    }

    case "bpo": {
      if (!itemList) return [];
      return allBlueprints.filter(
        (blueprint) =>
          blueprint.runs === -1 &&
          itemList.some(
            (item) =>
              item.blueprintID === blueprint.type_id &&
              item.jobType === jobTypes.manufacturing
          )
      );
    }

    case "bpc": {
      if (!itemList) return [];
      return allBlueprints.filter(
        (blueprint) =>
          blueprint.quantity === -2 &&
          itemList.some(
            (item) =>
              item.blueprintID === blueprint.type_id &&
              item.jobType === jobTypes.manufacturing
          )
      );
    }

    default:
      return allBlueprints;
  }
}

/**
 * Filters blueprints by a specific blueprint type ID (for search)
 *
 * @param {Array} allBlueprints - All available blueprints
 * @param {number} blueprintID - The blueprint type ID to filter by
 * @returns {Array} Filtered array of blueprints
 */
export function filterBlueprintsByID(allBlueprints, blueprintID) {
  return allBlueprints.filter((bp) => bp.type_id === blueprintID);
}

/**
 * Gets unique blueprint type IDs from an array of blueprints
 *
 * @param {Array} blueprints - Array of blueprint objects
 * @returns {Array} Array of unique blueprint type IDs
 */
export function getUniqueBlueprintIDs(blueprints) {
  return [...new Set(blueprints.map((bp) => bp.type_id))];
}


/**
 * Helpers for job setups that reference account custom structures.
 */

/**
 * @param {{ customStructureID?: string }} setup
 * @param {(id: string) => unknown} getCustomStructureWithID
 * @returns {boolean}
 */
export function setupHasOrphanedCustomStructure(
  setup,
  getCustomStructureWithID,
) {
  const id = setup?.customStructureID;
  if (!id) return false;
  return !getCustomStructureWithID(id);
}

/**
 * Manual structure fields apply when no custom structure is selected, or the
 * stored ID no longer exists in account settings.
 *
 * @param {{ customStructureID?: string }} setup
 * @param {(id: string) => unknown} getCustomStructureWithID
 * @returns {boolean}
 */
export function setupShowsManualStructureFields(
  setup,
  getCustomStructureWithID,
) {
  if (!setup?.customStructureID) return true;
  return setupHasOrphanedCustomStructure(setup, getCustomStructureWithID);
}

/**
 * Clears orphaned custom structure references in memory (denormalized fields kept).
 *
 * @param {Record<string, { customStructureID?: string }>} setups
 * @param {(id: string) => unknown} getCustomStructureWithID
 */
export function clearOrphanedCustomStructureOnSetups(
  setups,
  getCustomStructureWithID,
) {
  if (!setups) return;

  for (const setup of Object.values(setups)) {
    if (setupHasOrphanedCustomStructure(setup, getCustomStructureWithID)) {
      setup.customStructureID = "";
    }
  }
}

/**
 * What a job setup takes from the custom structure it references.
 *
 * @param {Object} structure - The custom structure the setup points at
 * @returns {{customStructureID: string, structureID: number, rigSlot1: number,
 * rigSlot2: number, systemTypeID: number, systemID: number, taxValue: number}}
 */
export function setupFieldsFromCustomStructure(structure) {
  return {
    customStructureID: structure.id,
    structureID: structure.structureType,
    rigSlot1: structure.rigSlot1 ?? 0,
    rigSlot2: structure.rigSlot2 ?? 0,
    systemTypeID: structure.systemType,
    systemID: structure.systemID,
    taxValue: structure.tax,
  };
}

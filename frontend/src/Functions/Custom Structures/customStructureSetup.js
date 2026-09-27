import useUsersStore from "../../Zustand/usersStore";

/**
 * Whether the saved structure a setup names is no longer there.
 *
 * @param {{ customStructureID?: string }} setup
 * @returns {boolean}
 */
export function setupHasOrphanedCustomStructure(setup) {
  const id = setup?.customStructureID;
  if (!id) return false;

  return !useUsersStore
    .getState()
    .applicationSettings.actions.getCustomStructureWithID(id);
}

/**
 * Manual structure fields apply when no custom structure is chosen, or the one it
 * names is no longer there.
 *
 * @param {{ customStructureID?: string }} setup
 * @returns {boolean}
 */
export function setupShowsManualStructureFields(setup) {
  if (!setup?.customStructureID) return true;
  return setupHasOrphanedCustomStructure(setup);
}

/**
 * Clears a reference to a structure that is gone, in memory, keeping the fields
 * the setup was built with.
 *
 * @param {Record<string, { customStructureID?: string }>} setups
 */
export function clearOrphanedCustomStructureOnSetups(setups) {
  if (!setups) return;

  for (const setup of Object.values(setups)) {
    if (setupHasOrphanedCustomStructure(setup)) {
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

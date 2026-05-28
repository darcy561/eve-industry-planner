/**
 * Helpers for job setups that reference account custom structures.
 */

/**
 * @param {{ customStructureID?: string }} setup
 * @param {(id: string) => unknown} getCustomStructureWithID
 * @returns {boolean}
 */
export function setupHasOrphanedCustomStructure(setup, getCustomStructureWithID) {
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
  getCustomStructureWithID
) {
  const id = setup?.customStructureID;
  if (!id) return true;
  return !getCustomStructureWithID(id);
}

/**
 * Clears orphaned custom structure references in memory (denormalized fields kept).
 *
 * @param {Record<string, { customStructureID?: string }>} setups
 * @param {(id: string) => unknown} getCustomStructureWithID
 */
export function clearOrphanedCustomStructureOnSetups(
  setups,
  getCustomStructureWithID
) {
  if (!setups) return;

  for (const setup of Object.values(setups)) {
    if (setupHasOrphanedCustomStructure(setup, getCustomStructureWithID)) {
      setup.customStructureID = "";
    }
  }
}

/**
 * Builds a default system index value object for missing system data.
 * 
 * This function creates a standardized system index object with default values:
 * - Initializes all industry activity indices to 0
 * - Sets the solar system ID from the provided parameter
 * - Adds timestamp for tracking when the data was created
 * - Provides consistent structure for system index data
 * 
 * @param {number} systemID - EVE Online solar system ID
 * @returns {Object} System index object with default values
 * @returns {number} returns.copying - Copying activity index (default: 0)
 * @returns {number} returns.invention - Invention activity index (default: 0)
 * @returns {number} returns.lastUpdated - Timestamp when object was created
 * @returns {number} returns.manufacturing - Manufacturing activity index (default: 0)
 * @returns {number} returns.reaction - Reaction activity index (default: 0)
 * @returns {number} returns.researching_material_efficiency - ME research index (default: 0)
 * @returns {number} returns.researching_time_efficiency - TE research index (default: 0)
 * @returns {number} returns.solar_system_id - The provided solar system ID
 * 
 * @example
 * const systemIndex = buildMissingSystemIndexValue(30000142);
 * console.log(systemIndex.solar_system_id); // 30000142
 * console.log(systemIndex.manufacturing); // 0
 */
function buildMissingSystemIndexValue(systemID) {
  return {
    copying: 0,
    invention: 0,
    lastUpdated: Date.now(),
    manufacturing: 0,
    reaction: 0,
    researching_material_efficiency: 0,
    researching_time_efficiency: 0,
    solar_system_id: Number(systemID),
  };
}
export default buildMissingSystemIndexValue;

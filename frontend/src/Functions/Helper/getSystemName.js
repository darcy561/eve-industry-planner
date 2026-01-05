import systemData from "../../RawData/systems.json";

/**
 * Retrieves the name of an EVE Online solar system by its system ID.
 * 
 * @param {number} systemID - EVE Online system ID
 * @returns {string} System name or "Unknown System" if not found
 * 
 * @example
 * const systemName = getSystemNameFromID(30000142);
 * console.log(systemName); // "Jita"
 */
function getSystemNameFromID(systemID) {
  const missingValue = "Unknown System";
  if (!systemID) return missingValue;

  return systemData.find((i) => i.id === systemID)?.name || missingValue;
}

export default getSystemNameFromID;

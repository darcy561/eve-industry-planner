import {
  Implants,
  structureTypeMap,
  systemTypeMap,
} from "../../Context/defaultValues";

/**
 * Retrieves structure information by job type and structure ID.
 *
 * @param {number} jobType - The job type (manufacturing, research, etc.)
 * @param {number} id - The structure ID
 * @returns {Object|null} Structure information object or null if not found
 */
function getStructureInfoFromID(jobType, id) {
  return structureTypeMap[jobType]?.[id] || null;
}

/**
 * Retrieves system type information by job type and system type ID.
 *
 * @param {number} jobType - The job type (manufacturing, research, etc.)
 * @param {number} id - The system type ID
 * @returns {Object|null} System type information object or null if not found
 */
function getSystemTypeFromID(jobType, id) {
  return systemTypeMap[jobType]?.[id] || null;
}

/**
 * The security band a kind of job offers for a system in that band, or null when
 * the kind has no entry for it — a reaction has no high security option.
 *
 * @param {number} jobType - The job type (manufacturing, research, etc.)
 * @param {string} band - The band a system is in
 * @returns {Object|null}
 */
function getSystemTypeFromBand(jobType, band) {
  if (!band) return null;

  return (
    Object.values(systemTypeMap[jobType] ?? {}).find(
      (entry) => entry.band === band && !entry.legacy,
    ) || null
  );
}

/**
 * Retrieves implant information by job type and implant ID.
 *
 * @param {number} jobType - The job type (manufacturing, research, etc.)
 * @param {number} id - The implant ID
 * @returns {Object|null} Implant information object or null if not found
 */
function getImplantFromID(jobType, id) {
  return Implants[jobType]?.[id] || null;
}

export {
  getStructureInfoFromID,
  getSystemTypeFromID,
  getSystemTypeFromBand,
  getImplantFromID,
};
